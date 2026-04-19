"""PRISM Autoresearch Engine — The heart of the measurement system.

Implements the full Gauge R&R-validated measurement loop:
1. Parse intent → CTQs
2. Filter candidate pool
3. Generate fresh test cases
4. Run candidates in parallel
5. Score via 3-judge panel (Gauge R&R)
6. Compute Cpk, DPMO, sigma-level per model
7. Bayesian posterior blending with HF archive priors
8. Return ranked results

Budget constraints: 90s wall-clock, $0.50 cost cap per intent.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional Langfuse tracing
# ---------------------------------------------------------------------------

try:
    from langfuse.decorators import observe  # type: ignore[import-untyped]
except ImportError:
    def observe(*args: Any, **kwargs: Any) -> Any:
        def decorator(fn: Any) -> Any:
            return fn
        if args and callable(args[0]):
            return args[0]
        return decorator


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_WALL_CLOCK_SECONDS = int(os.getenv("MAX_WALL_CLOCK_SECONDS", "90"))
MAX_COST_PER_INTENT = float(os.getenv("MAX_COST_PER_INTENT_USD", "0.50"))
DEFAULT_N_TRIALS = int(os.getenv("DEFAULT_N_TRIALS", "5"))
MIN_TRIALS_FOR_VALID_SIGMA = 3  # CLT minimum
DEFAULT_LSL = float(os.getenv("DEFAULT_LSL", "70"))


# ---------------------------------------------------------------------------
# Core autoresearch loop
# ---------------------------------------------------------------------------

@observe(name="prism.autoresearch")
async def run_autoresearch(
    intent: str,
    pillar: Optional[str] = None,
    n_trials: int = DEFAULT_N_TRIALS,
    lsl: float = DEFAULT_LSL,
    max_candidates: int = 5,
) -> Dict[str, Any]:
    """
    Run the full PRISM measurement pipeline for a given intent.

    This is the heart of the product — the measurement engine that produces
    Cpk, DPMO, and sigma-level for each candidate model.

    Flow:
    1. Parse intent via voc_parser → CTQs
    2. Filter candidate pool by hardware_tier and cost_envelope
    3. For each trial (default 5):
       a. Generate fresh test case via test_generator
       b. Run all candidates against test case IN PARALLEL
       c. Score each output via 3-judge panel IN PARALLEL
       d. Check Gauge R&R — flag if inter-judge σ > 20
    4. Compute per-candidate: Cpk, DPMO, sigma-level
    5. Bayesian posterior blend with HF archive priors
    6. Rank by MatchScore and return

    Args:
        intent: Plain-English builder intent (Voice of Customer)
        pillar: Override pillar detection (structured_output, language_fidelity, etc.)
        n_trials: Number of measurement trials (min 3 for CLT)
        lsl: Lower Specification Limit
        max_candidates: Maximum candidates to evaluate

    Returns:
        Dict with ranked results, timing, cost, and trace info
    """
    start_time = time.perf_counter()
    total_cost = 0.0

    # --- Step 1: Parse intent → CTQs ---
    from core.voc_parser import parse_intent, filter_candidates

    ctq = await parse_intent(intent)
    if pillar:
        ctq["primary_pillar"] = pillar

    logger.info("Intent parsed: primary_pillar=%s, hardware_tier=%s",
                ctq["primary_pillar"], ctq["hardware_tier"])

    # --- Step 2: Filter candidates ---
    candidates = await filter_candidates(ctq, max_candidates=max_candidates)
    logger.info("Filtered to %d candidates", len(candidates))

    if not candidates:
        return _empty_result(intent, "No candidates matched CTQ filters")

    # --- Step 3-6: Measurement loop ---
    from core.test_generator import generate_test_case
    from core.judge_panel import run_judge_panel
    from core.cpk_calculator import compute_model_statistics, compute_gauge_rr_stats

    # Track scores per model across trials
    model_scores: Dict[str, List[float]] = {c["model_id"]: [] for c in candidates}
    model_latencies: Dict[str, List[float]] = {c["model_id"]: [] for c in candidates}
    model_costs: Dict[str, float] = {c["model_id"]: 0.0 for c in candidates}
    gauge_rr_flags: List[bool] = []

    trials_completed = 0

    for trial_n in range(n_trials):
        # Budget check: wall clock
        elapsed = time.perf_counter() - start_time
        if elapsed > MAX_WALL_CLOCK_SECONDS:
            logger.warning("Wall-clock budget exhausted at trial %d/%d", trial_n, n_trials)
            break

        # Budget check: cost
        if total_cost > MAX_COST_PER_INTENT:
            logger.warning("Cost budget exhausted at trial %d/%d (spent $%.4f)",
                          trial_n, n_trials, total_cost)
            break

        # Generate fresh test case
        test_case = await generate_test_case(
            intent=intent,
            pillar=ctq["primary_pillar"],
            ctq_characteristics=ctq.get("ctq_characteristics", {}),
            trial_n=trial_n + 1,
        )

        # Run all candidates in parallel
        candidate_outputs = await _run_candidates_parallel(
            candidates, test_case, timeout_ms=20000
        )

        # Score each output via judge panel in parallel
        judge_tasks = []
        for model_id, output in candidate_outputs.items():
            if output is not None:
                judge_tasks.append(
                    _score_candidate(model_id, test_case, output, ctq)
                )

        judge_results = await asyncio.gather(*judge_tasks, return_exceptions=True)

        # Collect results
        trial_composites_per_judge: List[List[float]] = []  # For Gauge R&R

        for result in judge_results:
            if isinstance(result, Exception):
                logger.error("Judge panel failed for a candidate: %s", result)
                continue

            model_id = result["model_id"]
            composite = result["mean_composite"]
            model_scores[model_id].append(composite)
            model_latencies[model_id].append(result.get("latency_ms", 0))
            model_costs[model_id] += result.get("cost_usd", 0)
            total_cost += result.get("cost_usd", 0)

            # Track for Gauge R&R
            if "composite_scores" in result:
                trial_composites_per_judge.append(result["composite_scores"])
                gauge_rr_flags.append(result.get("measurement_reliable", True))

        trials_completed += 1

    # --- Step 4-5: Compute statistics per model ---
    results = []
    for candidate in candidates:
        model_id = candidate["model_id"]
        scores = model_scores.get(model_id, [])

        if len(scores) < MIN_TRIALS_FOR_VALID_SIGMA:
            logger.warning("Model %s has only %d trials (need %d) — sigma unreliable",
                          model_id, len(scores), MIN_TRIALS_FOR_VALID_SIGMA)

        # Get HF archive prior
        prior_mu = candidate.get("avg_prior", None)

        # Compute all stats
        stats = compute_model_statistics(
            scores=scores,
            lsl=lsl,
            prior_mu=prior_mu,
        )

        # Gauge R&R for this model's measurements
        grr_pct = 0.0
        if trial_composites_per_judge:
            # Transpose to get per-judge scores across trials
            grr_stats = compute_gauge_rr_stats(trial_composites_per_judge)
            grr_pct = grr_stats.get("grr_pct", 0.0)

        results.append({
            "model_id": model_id,
            "short_name": candidate.get("short_name", model_id.split("/")[-1]),
            "parameters_b": candidate.get("parameters_b", 0),
            "hardware_tier": candidate.get("hardware_tier", "unknown"),
            **stats,
            "gauge_rr_pct": round(grr_pct, 2),
            "total_cost_usd": round(model_costs.get(model_id, 0), 6),
            "avg_latency_ms": round(
                sum(model_latencies.get(model_id, [0])) / max(len(model_latencies.get(model_id, [1])), 1),
                1,
            ),
        })

    # --- Step 6: Rank by MatchScore (descending) ---
    results.sort(key=lambda r: r.get("match_score", 0), reverse=True)

    # Final timing
    wall_clock = time.perf_counter() - start_time

    return {
        "intent": intent,
        "pillar": ctq["primary_pillar"],
        "ctq": ctq,
        "candidates_evaluated": len(results),
        "trials_completed": trials_completed,
        "trials_requested": n_trials,
        "wall_clock_seconds": round(wall_clock, 2),
        "total_cost_usd": round(total_cost, 6),
        "budget_remaining_usd": round(MAX_COST_PER_INTENT - total_cost, 6),
        "gauge_rr_reliable": all(gauge_rr_flags) if gauge_rr_flags else None,
        "results": results,
    }


# ---------------------------------------------------------------------------
# Helper: run candidate models in parallel
# ---------------------------------------------------------------------------

async def _run_candidates_parallel(
    candidates: List[Dict],
    test_case: Dict,
    timeout_ms: int = 20000,
) -> Dict[str, Optional[str]]:
    """
    Send the test case prompt to all candidate models in parallel.

    Returns dict of model_id -> output (or None if failed/timed out).
    """
    import httpx

    prompt = test_case.get("prompt", "")
    outputs: Dict[str, Optional[str]] = {}

    async def _call_model(candidate: Dict) -> tuple[str, Optional[str]]:
        model_id = candidate["model_id"]
        try:
            output = await _invoke_candidate_model(
                model_id=model_id,
                prompt=prompt,
                timeout_ms=timeout_ms,
            )
            return model_id, output
        except Exception as e:
            logger.error("Model %s failed: %s", model_id, e)
            return model_id, None

    tasks = [_call_model(c) for c in candidates]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            continue
        model_id, output = result
        outputs[model_id] = output

    return outputs


@observe(name="prism.invoke_candidate")
async def _invoke_candidate_model(
    model_id: str,
    prompt: str,
    timeout_ms: int = 20000,
) -> str:
    """
    Invoke a candidate model and return its raw text output.

    Routes to the appropriate provider based on model_id prefix.
    """
    import openai

    # Route to provider
    provider = _get_provider(model_id)

    if provider == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        response = await client.messages.create(
            model=model_id.split("/")[-1] if "/" in model_id else model_id,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            timeout=timeout_ms / 1000,
        )
        return response.content[0].text

    elif provider == "together":
        client = openai.AsyncOpenAI(
            api_key=os.environ.get("TOGETHER_API_KEY", ""),
            base_url="https://api.together.xyz/v1",
        )
        response = await client.chat.completions.create(
            model=model_id,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            timeout=timeout_ms / 1000,
        )
        return response.choices[0].message.content or ""

    elif provider == "deepseek":
        client = openai.AsyncOpenAI(
            api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            base_url="https://api.deepseek.com/v1",
        )
        response = await client.chat.completions.create(
            model=model_id.split("/")[-1],
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            timeout=timeout_ms / 1000,
        )
        return response.choices[0].message.content or ""

    elif provider == "sarvam":
        client = openai.AsyncOpenAI(
            api_key=os.environ.get("SARVAM_API_KEY", ""),
            base_url="https://api.sarvam.ai/v1",
        )
        response = await client.chat.completions.create(
            model=model_id.split("/")[-1],
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            timeout=timeout_ms / 1000,
        )
        return response.choices[0].message.content or ""

    else:
        # Default: OpenAI-compatible via Together
        client = openai.AsyncOpenAI(
            api_key=os.environ.get("TOGETHER_API_KEY", ""),
            base_url="https://api.together.xyz/v1",
        )
        response = await client.chat.completions.create(
            model=model_id,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            timeout=timeout_ms / 1000,
        )
        return response.choices[0].message.content or ""


def _get_provider(model_id: str) -> str:
    """Determine which API provider to use for a given model_id."""
    model_lower = model_id.lower()
    if "anthropic" in model_lower or "claude" in model_lower:
        return "anthropic"
    elif "deepseek" in model_lower:
        return "deepseek"
    elif "sarvam" in model_lower:
        return "sarvam"
    else:
        return "together"  # Default: Together API for open models


# ---------------------------------------------------------------------------
# Helper: score a candidate via judge panel
# ---------------------------------------------------------------------------

async def _score_candidate(
    model_id: str,
    test_case: Dict,
    candidate_output: str,
    ctq: Dict,
) -> Dict[str, Any]:
    """Score a single candidate output via the 3-judge panel."""
    from core.judge_panel import run_judge_panel

    t0 = time.perf_counter()

    panel_result = await run_judge_panel(
        test_case=test_case,
        candidate_output=candidate_output,
        ctq=ctq,
    )

    latency_ms = (time.perf_counter() - t0) * 1000

    # Mean composite across judges
    composites = panel_result.get("composite_scores", [])
    mean_composite = sum(composites) / len(composites) if composites else 0.0

    return {
        "model_id": model_id,
        "mean_composite": round(mean_composite, 2),
        "composite_scores": composites,
        "inter_judge_sigma": panel_result.get("inter_judge_sigma", 0),
        "measurement_reliable": panel_result.get("measurement_reliable", True),
        "latency_ms": round(latency_ms, 1),
        "cost_usd": 0.015,  # Approximate cost per judge panel call
    }


# ---------------------------------------------------------------------------
# Empty result helper
# ---------------------------------------------------------------------------

def _empty_result(intent: str, reason: str) -> Dict[str, Any]:
    """Return an empty result set with an explanation."""
    return {
        "intent": intent,
        "pillar": None,
        "ctq": None,
        "candidates_evaluated": 0,
        "trials_completed": 0,
        "trials_requested": 0,
        "wall_clock_seconds": 0,
        "total_cost_usd": 0,
        "budget_remaining_usd": MAX_COST_PER_INTENT,
        "gauge_rr_reliable": None,
        "results": [],
        "error": reason,
    }
