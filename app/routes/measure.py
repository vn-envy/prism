"""FastAPI routes for /measure and /health."""

from __future__ import annotations

import hashlib
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException

from app.models import HealthResponse, MeasureRequest, MeasureResponse, ModelResult

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Evaluator prompt fingerprint — used for reproducibility tracking
# ---------------------------------------------------------------------------

EVALUATOR_PROMPT_VERSION = "v1.0.0"

def _evaluator_sha() -> str:
    """Return a stable SHA-256 prefix for the current evaluator prompt template."""
    return hashlib.sha256(EVALUATOR_PROMPT_VERSION.encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Available models registry
# ---------------------------------------------------------------------------

CANDIDATE_MODELS = [
    {"model_id": "anthropic/claude-sonnet-4-20250514", "short_name": "Claude Sonnet"},
    {"model_id": "openai/gpt-4o", "short_name": "GPT-4o"},
    {"model_id": "google/gemini-2.5-pro", "short_name": "Gemini 2.5 Pro"},
    {"model_id": "anthropic/claude-haiku-3.5", "short_name": "Claude Haiku 3.5"},
    {"model_id": "openai/gpt-4o-mini", "short_name": "GPT-4o Mini"},
]


# ---------------------------------------------------------------------------
# POST /measure
# ---------------------------------------------------------------------------

@router.post("/measure", response_model=MeasureResponse)
async def measure(req: MeasureRequest) -> MeasureResponse:
    """Run a full PRISM measurement cycle.

    1. Generate / retrieve test cases for the intent.
    2. Execute each candidate model n_trials times.
    3. Score every output via the 3-frontier-judge panel.
    4. Compute SPC statistics (mu, sigma, Cpk, DPMO, sigma-level).
    5. Return ranked results.
    """
    start = time.perf_counter()

    try:
        results = await _run_measurement_pipeline(req)
    except Exception as exc:
        logger.exception("Measurement pipeline failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    wall_clock = time.perf_counter() - start
    total_cost = sum(r.cost_usd for r in results)

    return MeasureResponse(
        model_results=results,
        wall_clock_seconds=round(wall_clock, 2),
        total_cost_usd=round(total_cost, 6),
        trace_url=None,  # populated by Langfuse callback when connected
    )


async def _run_measurement_pipeline(req: MeasureRequest) -> list[ModelResult]:
    """Stub implementation — wire up to core.autoresearch + core.judge_panel."""
    import asyncio
    import math
    import random

    from app.database import store_measurement

    results: list[ModelResult] = []

    for model_info in CANDIDATE_MODELS:
        scores: list[float] = []
        total_cost = 0.0
        total_latency = 0.0

        for trial in range(req.n_trials):
            # --- placeholder: replace with real candidate invocation + judge panel ---
            score = random.gauss(82, 6)
            score = max(0.0, min(100.0, score))
            latency = random.uniform(800, 3500)
            cost = random.uniform(0.002, 0.02)

            scores.append(score)
            total_cost += cost
            total_latency += latency

            # Persist measurement
            await store_measurement(
                {
                    "model_id": model_info["model_id"],
                    "test_case_id": f"auto-{req.intent[:32]}",
                    "trial_n": trial,
                    "pillar": req.pillar or "general",
                    "frontier_judge": "panel-v1",
                    "score": score,
                    "task_accuracy": score * random.uniform(0.9, 1.0),
                    "structural_compliance": score * random.uniform(0.85, 1.0),
                    "language_fidelity": score * random.uniform(0.9, 1.0),
                    "safety_groundedness": score * random.uniform(0.88, 1.0),
                    "defect_flag": score < req.lsl,
                    "defect_type": "below_lsl" if score < req.lsl else None,
                    "latency_ms": int(latency),
                    "cost_usd": cost,
                    "intent": req.intent,
                    "evaluator_sha": _evaluator_sha(),
                }
            )

        # --- SPC statistics ---
        mu = sum(scores) / len(scores)
        sigma = (sum((s - mu) ** 2 for s in scores) / len(scores)) ** 0.5 if len(scores) > 1 else 0.0
        sigma = max(sigma, 1e-9)  # avoid division by zero

        cpk = (mu - req.lsl) / (3 * sigma)
        cpk = max(cpk, 0.0)

        # DPMO & sigma level
        from scipy.stats import norm  # type: ignore[import-untyped]

        z = (mu - req.lsl) / sigma
        defect_probability = norm.cdf(-z)
        dpmo = defect_probability * 1_000_000
        sigma_level = z + 1.5  # conventional 1.5σ shift

        # Verdict
        if sigma_level >= 6:
            verdict = f"{sigma_level:.1f}σ — World Class"
        elif sigma_level >= 4:
            verdict = f"{sigma_level:.1f}σ — Capable"
        elif sigma_level >= 3:
            verdict = f"{sigma_level:.1f}σ — Marginal"
        else:
            verdict = f"{sigma_level:.1f}σ — Incapable"

        results.append(
            ModelResult(
                model_id=model_info["model_id"],
                short_name=model_info["short_name"],
                mu=round(mu, 2),
                sigma=round(sigma, 2),
                cpk=round(cpk, 3),
                dpmo=round(dpmo, 1),
                sigma_level=round(sigma_level, 2),
                match_score=round(mu, 1),  # placeholder
                verdict=verdict,
                gauge_rr_pct=round(random.uniform(5, 18), 1),  # placeholder
                cost_usd=round(total_cost, 6),
                latency_ms=round(total_latency / req.n_trials, 1),
            )
        )

    # Rank by Cpk descending
    results.sort(key=lambda r: r.cpk, reverse=True)
    return results


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Return system health status."""
    langfuse_ok = False
    try:
        from langfuse import Langfuse  # type: ignore[import-untyped]

        lf = Langfuse()
        lf.auth_check()
        langfuse_ok = True
    except Exception:
        logger.debug("Langfuse not connected")

    return HealthResponse(
        status="ok" if langfuse_ok else "degraded",
        evaluator_sha=_evaluator_sha(),
        models_available=[m["model_id"] for m in CANDIDATE_MODELS],
        langfuse_connected=langfuse_ok,
    )
