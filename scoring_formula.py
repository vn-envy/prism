"""
PRISM Scoring Formula v1 — Locked Evaluator Implementation

This module implements the core statistical calculations for the
Process Reliability Index for Supplier Models (PRISM).

LOCKED: Do not modify after initial commit. SHA pinned for integrity.

Six Sigma Statistical Process Control applied to LLM evaluation.
"""

import math
from typing import List, Dict, Optional, Tuple

# ============================================================================
# SIGMA TABLE — Standard Motorola Six Sigma DPMO-to-Sigma conversion
# ============================================================================

SIGMA_TABLE = {
    6.0: 3.4,
    5.5: 32,
    5.0: 233,
    4.5: 1350,
    4.0: 6210,
    3.5: 22750,
    3.0: 66807,
    2.5: 158655,
    2.0: 308538,
    1.5: 500000,
    1.0: 691462,
    0.5: 841345,
    0.0: 933193,
}

# Rubric dimension weights (must sum to 1.0)
RUBRIC_WEIGHTS = {
    "task_accuracy": 0.40,
    "structural_compliance": 0.25,
    "language_fidelity": 0.20,
    "safety_groundedness": 0.15,
}

# Cpk interpretation thresholds
CPK_THRESHOLDS = {
    "excellent": 1.67,      # Six Sigma capable
    "good": 1.33,           # Production-grade
    "marginal": 1.00,       # Monitor closely
    "poor": 0.67,           # Expect defects
    # Below 0.67 = incapable
}

# Gauge R&R thresholds
GAUGE_RR_ACCEPTABLE = 0.30    # < 30% = measurement system OK
GAUGE_RR_MARGINAL = 0.50      # 30-50% = marginally reliable
# > 50% = unreliable

# Inter-judge disagreement threshold for re-run
JUDGE_DISAGREEMENT_THRESHOLD = 20.0  # sigma > 20 triggers re-run


# ============================================================================
# CORE STATISTICAL FUNCTIONS
# ============================================================================

def composite_score(
    task_accuracy: float,
    structural_compliance: float,
    language_fidelity: float,
    safety_groundedness: float,
) -> float:
    """
    Calculate weighted composite score from four rubric dimensions.

    Args:
        task_accuracy: Score 0-100 on task completion
        structural_compliance: Score 0-100 on format adherence
        language_fidelity: Score 0-100 on language correctness
        safety_groundedness: Score 0-100 on factual grounding

    Returns:
        Weighted composite score (0-100)
    """
    return (
        task_accuracy * RUBRIC_WEIGHTS["task_accuracy"]
        + structural_compliance * RUBRIC_WEIGHTS["structural_compliance"]
        + language_fidelity * RUBRIC_WEIGHTS["language_fidelity"]
        + safety_groundedness * RUBRIC_WEIGHTS["safety_groundedness"]
    )


def cpk(mu: float, sigma: float, lsl: float, usl: float = None) -> float:
    """
    Calculate Process Capability Index (Cpk).

    Cpk measures how well a process fits within specification limits,
    accounting for how centered the process mean is.

    For two-sided: Cpk = min((USL - mu) / 3*sigma, (mu - LSL) / 3*sigma)
    For one-sided (LSL only): Cpk = (mu - LSL) / 3*sigma

    For LLM quality scores, USL is typically None (one-sided) because
    "too high quality" is never a defect. This matches the playbook's
    formulation where USL_builder is only relevant for latency/cost metrics.

    A Cpk >= 1.33 indicates a production-grade process.
    A Cpk < 1.0 indicates the process will produce defects.

    Args:
        mu: Process mean (average score across trials)
        sigma: Process standard deviation (across trials)
        lsl: Lower Specification Limit (builder's minimum acceptable)
        usl: Upper Specification Limit (None = one-sided, LSL only)

    Returns:
        Cpk value. Returns 999.0 if sigma is 0 and mean is within spec.
    """
    if sigma <= 0:
        # Perfect consistency — check if mean is within spec
        if mu >= lsl and (usl is None or mu <= usl):
            return 999.0  # Effectively infinite capability
        return 0.0

    cpk_lower = (mu - lsl) / (3 * sigma)

    if usl is None:
        # One-sided Cpk (quality scores — can't be "too good")
        return cpk_lower

    cpk_upper = (usl - mu) / (3 * sigma)
    return min(cpk_upper, cpk_lower)


def cp(sigma: float, lsl: float, usl: float = 100) -> float:
    """
    Calculate Process Capability (Cp) — potential capability ignoring centering.

    Formula: Cp = (USL - LSL) / 6*sigma

    Cp represents what the process COULD achieve if perfectly centered.
    Cpk represents what it ACTUALLY achieves given its current centering.

    Args:
        sigma: Process standard deviation
        lsl: Lower Specification Limit
        usl: Upper Specification Limit

    Returns:
        Cp value.
    """
    if sigma <= 0:
        return 999.0
    return (usl - lsl) / (6 * sigma)


def dpmo(defects: int, opportunities: int) -> float:
    """
    Calculate Defects Per Million Opportunities.

    DPMO normalizes defect counts to a per-million scale,
    enabling comparison across different sample sizes.

    Formula: DPMO = (defects / opportunities) * 1,000,000

    Args:
        defects: Number of defective outputs observed
        opportunities: Total number of opportunities for defect

    Returns:
        DPMO value (0 to 1,000,000)
    """
    if opportunities <= 0:
        return 0.0
    return (defects / opportunities) * 1_000_000


def sigma_level(dpmo_value: float) -> float:
    """
    Convert DPMO to sigma level via linear interpolation on the Motorola table.

    Standard Six Sigma conversion:
        6σ = 3.4 DPMO (world class)
        4σ = 6,210 DPMO (acceptable)
        3σ = 66,807 DPMO (below average)
        2σ = 308,538 DPMO (unacceptable)

    Args:
        dpmo_value: Defects Per Million Opportunities

    Returns:
        Sigma level (0.0 to 6.0+)
    """
    if dpmo_value <= 0:
        return 6.0  # Perfect — no defects
    if dpmo_value >= 933193:
        return 0.0  # Completely incapable

    # Sort table by sigma level descending
    sorted_table = sorted(SIGMA_TABLE.items(), key=lambda x: x[0], reverse=True)

    # Find the two bracketing entries and interpolate
    for i in range(len(sorted_table) - 1):
        sigma_high, dpmo_low = sorted_table[i]
        sigma_low, dpmo_high = sorted_table[i + 1]

        if dpmo_low <= dpmo_value <= dpmo_high:
            # Linear interpolation between the two sigma levels
            fraction = (dpmo_value - dpmo_low) / (dpmo_high - dpmo_low)
            return sigma_high - fraction * (sigma_high - sigma_low)

    # Fallback — should not reach here
    return 0.0


def gauge_rr(scores_matrix: List[List[float]]) -> Dict[str, float]:
    """
    Calculate Gauge R&R (Repeatability & Reproducibility) for the judge panel.

    In manufacturing: validates that the measurement instrument is reliable
    before using it to qualify parts.

    In PRISM: validates that the 3-judge frontier panel produces consistent
    scores before using those scores to qualify candidate models.

    Args:
        scores_matrix: 2D list where rows = judges, columns = candidate outputs
                      e.g., [[judge1_scores...], [judge2_scores...], [judge3_scores...]]

    Returns:
        Dict with:
            - grr_pct: Gauge R&R as percentage of total variance
            - repeatability: Within-judge variance component
            - reproducibility: Between-judge variance component
            - part_variance: Actual candidate model variance
            - acceptable: Boolean — True if GRR < 30%
    """
    if not scores_matrix or not scores_matrix[0]:
        return {
            "grr_pct": 0.0,
            "repeatability": 0.0,
            "reproducibility": 0.0,
            "part_variance": 0.0,
            "acceptable": True,
        }

    n_judges = len(scores_matrix)
    n_parts = len(scores_matrix[0])

    # Grand mean
    all_scores = [s for row in scores_matrix for s in row]
    grand_mean = sum(all_scores) / len(all_scores)

    # Judge means (reproducibility component)
    judge_means = [sum(row) / len(row) for row in scores_matrix]
    reproducibility_var = (
        sum((jm - grand_mean) ** 2 for jm in judge_means) / max(n_judges - 1, 1)
    )

    # Within-judge variance (repeatability component)
    within_variances = []
    for row in scores_matrix:
        judge_mean = sum(row) / len(row)
        var = sum((s - judge_mean) ** 2 for s in row) / max(len(row) - 1, 1)
        within_variances.append(var)
    repeatability_var = sum(within_variances) / len(within_variances)

    # Part (candidate model) variance
    part_means = []
    for j in range(n_parts):
        col = [scores_matrix[i][j] for i in range(n_judges)]
        part_means.append(sum(col) / len(col))
    part_var = (
        sum((pm - grand_mean) ** 2 for pm in part_means) / max(n_parts - 1, 1)
    )

    # Total variance
    measurement_var = repeatability_var + reproducibility_var
    total_var = measurement_var + part_var

    # GRR percentage
    grr_pct = (measurement_var / total_var * 100) if total_var > 0 else 0.0

    return {
        "grr_pct": round(grr_pct, 2),
        "repeatability": round(repeatability_var, 4),
        "reproducibility": round(reproducibility_var, 4),
        "part_variance": round(part_var, 4),
        "acceptable": grr_pct < (GAUGE_RR_ACCEPTABLE * 100),
    }


def match_score(
    posterior_mu: float,
    sigma: float,
    ctq_weights: Optional[Dict[str, float]] = None,
) -> float:
    """
    Calculate the final MatchScore for ranking candidate models.

    Formula: MatchScore = 0.6 * weighted_posterior_mu + 0.4 * (100 - normalized_sigma)

    This balances performance (mu) against reliability (sigma).
    A model with slightly lower mu but much tighter sigma will rank higher —
    which is the correct behavior for production supplier selection.

    Args:
        posterior_mu: Bayesian posterior mean (0.3 * prior + 0.7 * likelihood)
        sigma: Standard deviation across trials
        ctq_weights: Optional CTQ-weighted adjustments

    Returns:
        MatchScore (0-100)
    """
    # Normalize sigma to 0-100 scale (assuming max practical sigma is ~25)
    normalized_sigma = min(sigma / 25.0 * 100, 100)

    score = 0.6 * posterior_mu + 0.4 * (100 - normalized_sigma)

    return round(min(max(score, 0), 100), 2)


def bayesian_posterior(
    measured_mu: float,
    measured_sigma: float,
    prior_mu: float,
    prior_sigma: float = 10.0,
    prior_weight: float = 0.3,
) -> Tuple[float, float]:
    """
    Compute Bayesian posterior blending measured performance with HF archive prior.

    Prior: HuggingFace archived leaderboard score for closest-matching eval
    Likelihood: Measured mu with variance sigma from PRISM trials
    Posterior: prior_weight * prior + (1 - prior_weight) * likelihood

    This prevents a single lucky/unlucky run from dominating the recommendation.
    With 5+ trials, the likelihood dominates (70% weight). With fewer trials,
    the prior provides stabilization.

    Args:
        measured_mu: Mean score from PRISM measurement trials
        measured_sigma: Std dev from PRISM measurement trials
        prior_mu: HF leaderboard score (normalized to 0-100)
        prior_sigma: Uncertainty in the prior (default 10)
        prior_weight: Weight given to prior (default 0.3)

    Returns:
        Tuple of (posterior_mu, posterior_sigma)
    """
    likelihood_weight = 1 - prior_weight

    posterior_mu = prior_weight * prior_mu + likelihood_weight * measured_mu
    posterior_sigma = math.sqrt(
        (prior_weight * prior_sigma) ** 2 + (likelihood_weight * measured_sigma) ** 2
    )

    return round(posterior_mu, 2), round(posterior_sigma, 2)


def cpk_verdict(cpk_value: float) -> str:
    """
    Translate Cpk into a human-readable verdict.

    Uses standard Six Sigma thresholds:
        >= 1.67: Excellent (Six Sigma capable)
        >= 1.33: Good (production-grade)
        >= 1.00: Marginal (monitor closely)
        >= 0.67: Poor (expect defects)
        < 0.67: Incapable (do not use)

    Args:
        cpk_value: Calculated Cpk

    Returns:
        Verdict string
    """
    if cpk_value >= CPK_THRESHOLDS["excellent"]:
        return "excellent"
    elif cpk_value >= CPK_THRESHOLDS["good"]:
        return "production_grade"
    elif cpk_value >= CPK_THRESHOLDS["marginal"]:
        return "marginal"
    elif cpk_value >= CPK_THRESHOLDS["poor"]:
        return "poor"
    else:
        return "incapable"


def sigma_color(sigma_level_value: float) -> str:
    """
    Map sigma level to UI color code.

    Args:
        sigma_level_value: Calculated sigma level

    Returns:
        Color string for UI rendering
    """
    if sigma_level_value >= 5.0:
        return "dark_green"
    elif sigma_level_value >= 4.0:
        return "green"
    elif sigma_level_value >= 3.0:
        return "yellow"
    elif sigma_level_value >= 2.0:
        return "orange"
    else:
        return "red"


# ============================================================================
# VALIDATION — Run on import to verify formula integrity
# ============================================================================

def _self_test():
    """Internal consistency check for the scoring formula."""
    # Test Cpk: Model A (mu=92, sigma=2, LSL=85) should be ~1.17
    # Formula: (92 - 85) / (3 * 2) = 7/6 = 1.167
    assert 1.1 < cpk(92, 2, 85) < 1.2, "Cpk test failed for Model A"

    # Test Cpk: Model B (mu=95, sigma=8, LSL=85) should be ~0.42
    # Formula: (95 - 85) / (3 * 8) = 10/24 = 0.417
    assert 0.4 < cpk(95, 8, 85) < 0.45, "Cpk test failed for Model B"

    # Model A should have HIGHER Cpk than Model B (the core insight)
    # This is THE key product insight: lower mu but tighter sigma wins
    assert cpk(92, 2, 85) > cpk(95, 8, 85), "Cpk ranking inverted!"

    # Test two-sided Cpk (e.g., for latency where too-fast is also a concern)
    # mu=50, sigma=5, LSL=30, USL=70 → min((70-50)/15, (50-30)/15) = min(1.33, 1.33)
    assert abs(cpk(50, 5, 30, 70) - 1.33) < 0.01, "Two-sided Cpk failed"

    # Test DPMO
    assert dpmo(7, 1000) == 7000.0, "DPMO calculation failed"

    # Test sigma level for 6210 DPMO should be ~4.0
    assert 3.9 < sigma_level(6210) < 4.1, "Sigma level lookup failed"

    # Test composite score
    cs = composite_score(90, 85, 80, 95)
    expected = 90 * 0.4 + 85 * 0.25 + 80 * 0.2 + 95 * 0.15
    assert abs(cs - expected) < 0.01, "Composite score failed"

    # Test match score favors low-sigma model
    ms_tight = match_score(90, 2)   # High mu, low sigma
    ms_loose = match_score(92, 12)  # Higher mu, high sigma
    assert ms_tight > ms_loose, "MatchScore should favor tighter sigma"


# Run self-test on import
_self_test()
