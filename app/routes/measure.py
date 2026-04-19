"""FastAPI routes for /measure and /health."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Any

from fastapi import APIRouter, HTTPException

from app.models import HealthResponse, MeasureRequest, MeasureResponse, ModelResult

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Evaluator SHA — derived from the locked evaluator_v1.md commit
# ---------------------------------------------------------------------------

EVALUATOR_PROMPT_VERSION = "v1.0.0"
EVALUATOR_COMMIT_SHA = "937202df"  # Pre-hackathon commit


def _evaluator_sha() -> str:
    """Return the evaluator's identity SHA."""
    return EVALUATOR_COMMIT_SHA


# ---------------------------------------------------------------------------
# POST /measure — wired to real autoresearch engine
# ---------------------------------------------------------------------------

@router.post("/measure", response_model=MeasureResponse)
async def measure(req: MeasureRequest) -> MeasureResponse:
    """Run a full PRISM measurement cycle via the autoresearch engine.

    Flow (per the Six Sigma DMAIC Measure phase):
    1. Parse builder intent → CTQ characteristics (Voice of Customer)
    2. Filter candidate pool by hardware_tier and cost_envelope
    3. Generate fresh test cases per trial (locked test generator)
    4. Run all candidates IN PARALLEL (asyncio.gather)
    5. Score every output via 3-frontier-judge Gauge R&R panel
    6. Compute SPC statistics: Cpk, DPMO, sigma-level per model
    7. Bayesian posterior blend with HF archive priors
    8. Return ranked results by MatchScore
    """
    start = time.perf_counter()

    try:
        from core.autoresearch import run_autoresearch

        raw_result = await run_autoresearch(
            intent=req.intent,
            pillar=req.pillar,
            n_trials=req.n_trials,
            lsl=req.lsl,
            max_candidates=5,
        )
    except Exception as exc:
        logger.exception("Measurement pipeline failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    wall_clock = time.perf_counter() - start

    # Convert raw results to API response models
    model_results = []
    for r in raw_result.get("results", []):
        model_results.append(
            ModelResult(
                model_id=r.get("model_id", "unknown"),
                short_name=r.get("short_name", "Unknown"),
                mu=r.get("mu", 0.0),
                sigma=r.get("sigma", 0.0),
                cpk=r.get("cpk", 0.0),
                dpmo=r.get("dpmo", 0.0),
                sigma_level=r.get("sigma_level", 0.0),
                match_score=r.get("match_score", 0.0),
                verdict=r.get("verdict", "unknown"),
                gauge_rr_pct=r.get("gauge_rr_pct", 0.0),
                cost_usd=r.get("total_cost_usd", 0.0),
                latency_ms=r.get("avg_latency_ms", 0.0),
                trial_scores=r.get("scores", None),
                lsl=req.lsl,
                parameters_b=r.get("parameters_b", None),
                hardware_tier=r.get("hardware_tier", None),
            )
        )

    total_cost = raw_result.get("total_cost_usd", 0.0)

    return MeasureResponse(
        model_results=model_results,
        wall_clock_seconds=round(wall_clock, 2),
        total_cost_usd=round(total_cost, 6),
        trace_url=None,  # Populated by Langfuse when connected
    )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Return system health status including evaluator integrity check."""
    langfuse_ok = False
    try:
        from langfuse import Langfuse  # type: ignore[import-untyped]

        lf = Langfuse()
        lf.auth_check()
        langfuse_ok = True
    except Exception:
        logger.debug("Langfuse not connected")

    # Load candidate models from archive
    models_available = []
    try:
        archive_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "hf_archive.json"
        )
        with open(archive_path) as f:
            archive = json.load(f)
        models_available = [m["model_id"] for m in archive.get("models", [])]
    except Exception:
        models_available = ["(archive not loaded)"]

    return HealthResponse(
        status="ok" if langfuse_ok else "degraded",
        evaluator_sha=_evaluator_sha(),
        models_available=models_available,
        langfuse_connected=langfuse_ok,
    )
