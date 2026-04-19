"""PRISM Cpk Calculator — Bridge to scoring_formula.py for the measurement pipeline.

This module provides the interface used by autoresearch.py and the /measure route
to compute all Six Sigma statistics from raw trial scores.
"""

from __future__ import annotations

import sys
import os
from typing import List, Dict, Any

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scoring_formula import (
    cpk,
    cp,
    dpmo,
    sigma_level,
    gauge_rr,
    match_score,
    bayesian_posterior,
    composite_score,
    cpk_verdict,
    sigma_color,
    RUBRIC_WEIGHTS,
    CPK_THRESHOLDS,
)
from sigma_table import (
    dpmo_to_sigma,
    sigma_to_dpmo,
    format_sigma_display,
    get_color,
    get_interpretation,
)


def compute_model_statistics(
    scores: List[float],
    lsl: float = 70.0,
    usl: float = None,
    prior_mu: float = None,
    prior_sigma: float = 10.0,
) -> Dict[str, Any]:
    """
    Compute full Six Sigma process capability statistics for a model.

    Takes raw trial scores and returns Cpk, DPMO, sigma level, and verdict.

    Args:
        scores: List of composite scores from trials (one per trial)
        lsl: Lower Specification Limit (builder's minimum acceptable)
        usl: Upper Specification Limit (None = one-sided for quality scores)
        prior_mu: HF leaderboard prior mean (for Bayesian blending)
        prior_sigma: Uncertainty in prior

    Returns:
        Dict with full statistical profile
    """
    n = len(scores)
    if n == 0:
        return _empty_stats()

    # Basic statistics
    mu = sum(scores) / n
    variance = sum((s - mu) ** 2 for s in scores) / max(n - 1, 1)
    sigma = variance ** 0.5
    sigma = max(sigma, 1e-9)  # Avoid division by zero

    # Process Capability
    cpk_value = cpk(mu, sigma, lsl, usl)
    cp_value = cp(sigma, lsl, usl if usl else 100.0)

    # Defect counting
    defect_count = sum(1 for s in scores if s < lsl)
    total_opportunities = n
    dpmo_value = dpmo(defect_count, total_opportunities)

    # Sigma level
    sigma_level_value = dpmo_to_sigma(dpmo_value)

    # Bayesian posterior (if prior available)
    posterior_mu = mu
    posterior_sigma = sigma
    if prior_mu is not None:
        posterior_mu, posterior_sigma = bayesian_posterior(
            measured_mu=mu,
            measured_sigma=sigma,
            prior_mu=prior_mu,
            prior_sigma=prior_sigma,
        )

    # Match score
    ms = match_score(posterior_mu, sigma)

    # Verdict
    verdict = cpk_verdict(cpk_value)

    return {
        "n_trials": n,
        "mu": round(mu, 2),
        "sigma": round(sigma, 2),
        "cpk": round(cpk_value, 3),
        "cp": round(cp_value, 3),
        "dpmo": round(dpmo_value, 1),
        "sigma_level": round(sigma_level_value, 2),
        "sigma_display": format_sigma_display(dpmo_value),
        "defect_count": defect_count,
        "defect_rate": round(defect_count / total_opportunities, 4) if total_opportunities > 0 else 0,
        "match_score": ms,
        "posterior_mu": round(posterior_mu, 2),
        "posterior_sigma": round(posterior_sigma, 2),
        "verdict": verdict,
        "color": get_color(sigma_level_value),
        "interpretation": get_interpretation(sigma_level_value),
        "lsl": lsl,
        "usl": usl,
        "scores": scores,
    }


def compute_gauge_rr_stats(
    judge_scores_matrix: List[List[float]],
) -> Dict[str, Any]:
    """
    Compute Gauge R&R statistics from the judge panel scores.

    Args:
        judge_scores_matrix: 2D list [judges × candidates/trials]
            e.g., [[judge1_scores...], [judge2_scores...], [judge3_scores...]]

    Returns:
        Dict with GRR statistics and acceptability determination
    """
    grr = gauge_rr(judge_scores_matrix)
    return grr


def compute_composite_from_dimensions(
    task_accuracy: float,
    structural_compliance: float,
    language_fidelity: float,
    safety_groundedness: float,
) -> float:
    """Compute weighted composite score from four rubric dimensions."""
    return composite_score(
        task_accuracy, structural_compliance, language_fidelity, safety_groundedness
    )


def _empty_stats() -> Dict[str, Any]:
    """Return empty statistics when no scores available."""
    return {
        "n_trials": 0,
        "mu": 0.0,
        "sigma": 0.0,
        "cpk": 0.0,
        "cp": 0.0,
        "dpmo": 1_000_000.0,
        "sigma_level": 0.0,
        "sigma_display": "0.0σ (1,000,000 DPMO)",
        "defect_count": 0,
        "defect_rate": 0.0,
        "match_score": 0.0,
        "posterior_mu": 0.0,
        "posterior_sigma": 0.0,
        "verdict": "incapable",
        "color": "red",
        "interpretation": "Failure — nearly random output",
        "lsl": 70.0,
        "usl": None,
        "scores": [],
    }


# Self-test
if __name__ == "__main__":
    # Model A: mu=92, sigma=2 — should be "marginal" to "good"
    stats_a = compute_model_statistics([90, 93, 91, 94, 92], lsl=85)
    print(f"Model A: Cpk={stats_a['cpk']}, σ-level={stats_a['sigma_level']}, verdict={stats_a['verdict']}")

    # Model B: mu=95, sigma=8 — should be "poor" to "marginal"
    stats_b = compute_model_statistics([87, 103, 88, 98, 99], lsl=85)
    print(f"Model B: Cpk={stats_b['cpk']}, σ-level={stats_b['sigma_level']}, verdict={stats_b['verdict']}")

    # Core insight: Model A should have higher Cpk
    assert stats_a["cpk"] > stats_b["cpk"], "Cpk should favor tighter sigma!"
    print("\n✓ Core insight validated: lower-mu + tighter-sigma > higher-mu + loose-sigma")
