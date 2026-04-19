"""
PRISM Sigma Table — Standard Motorola Six Sigma DPMO-to-Sigma Conversion

Pre-built lookup table for converting between DPMO and sigma levels.
This is the same table used globally in manufacturing quality engineering
since Motorola formalized Six Sigma in 1986.

Reference: The 1.5-sigma shift is included per Motorola convention.
"""

from typing import Tuple

# Complete DPMO-to-Sigma lookup table
# Format: sigma_level -> DPMO
SIGMA_TO_DPMO = {
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

# Reverse lookup: DPMO -> sigma_level (sorted for binary search)
DPMO_TO_SIGMA = sorted(
    [(dpmo, sigma) for sigma, dpmo in SIGMA_TO_DPMO.items()],
    key=lambda x: x[0],
)

# Human-readable interpretations
SIGMA_INTERPRETATIONS = {
    6.0: "World class (Six Sigma)",
    5.5: "Excellent",
    5.0: "Very good",
    4.5: "Good",
    4.0: "Industry average — acceptable for most processes",
    3.5: "Below average",
    3.0: "Minimum acceptable — below industry standard",
    2.5: "Poor — significant defect rate",
    2.0: "Very poor — unacceptable for production",
    1.5: "Critical — process fundamentally broken",
    1.0: "Failure — nearly random output",
}

# Color codes for UI rendering
SIGMA_COLORS = {
    (5.0, 6.0): "dark_green",   # Exceptional
    (4.0, 5.0): "green",        # Good
    (3.0, 4.0): "yellow",       # Marginal
    (2.0, 3.0): "orange",       # Poor
    (0.0, 2.0): "red",          # Incapable
}


def dpmo_to_sigma(dpmo_value: float) -> float:
    """
    Convert DPMO to sigma level via linear interpolation.

    Args:
        dpmo_value: Defects Per Million Opportunities (0 to 1,000,000)

    Returns:
        Sigma level (0.0 to 6.0)

    Examples:
        >>> dpmo_to_sigma(3.4)
        6.0
        >>> dpmo_to_sigma(6210)
        4.0
        >>> dpmo_to_sigma(66807)
        3.0
    """
    if dpmo_value <= 3.4:
        return 6.0
    if dpmo_value >= 933193:
        return 0.0

    # Find bracketing entries
    for i in range(len(DPMO_TO_SIGMA) - 1):
        dpmo_low, sigma_high = DPMO_TO_SIGMA[i]
        dpmo_high, sigma_low = DPMO_TO_SIGMA[i + 1]

        if dpmo_low <= dpmo_value <= dpmo_high:
            # Linear interpolation
            fraction = (dpmo_value - dpmo_low) / (dpmo_high - dpmo_low)
            return sigma_high - fraction * (sigma_high - sigma_low)

    return 0.0


def sigma_to_dpmo(sigma_value: float) -> float:
    """
    Convert sigma level to DPMO via linear interpolation.

    Args:
        sigma_value: Sigma level (0.0 to 6.0)

    Returns:
        DPMO value

    Examples:
        >>> sigma_to_dpmo(6.0)
        3.4
        >>> sigma_to_dpmo(4.0)
        6210.0
        >>> sigma_to_dpmo(3.0)
        66807.0
    """
    if sigma_value >= 6.0:
        return 3.4
    if sigma_value <= 0.0:
        return 933193.0

    # Sort by sigma descending
    sorted_entries = sorted(SIGMA_TO_DPMO.items(), key=lambda x: x[0], reverse=True)

    for i in range(len(sorted_entries) - 1):
        sigma_high, dpmo_low = sorted_entries[i]
        sigma_low, dpmo_high = sorted_entries[i + 1]

        if sigma_low <= sigma_value <= sigma_high:
            fraction = (sigma_high - sigma_value) / (sigma_high - sigma_low)
            return dpmo_low + fraction * (dpmo_high - dpmo_low)

    return 933193.0


def get_color(sigma_value: float) -> str:
    """Get UI color for a sigma level."""
    for (low, high), color in SIGMA_COLORS.items():
        if low <= sigma_value < high:
            return color
    if sigma_value >= 6.0:
        return "dark_green"
    return "red"


def get_interpretation(sigma_value: float) -> str:
    """Get human-readable interpretation for a sigma level."""
    # Find closest sigma level in interpretations
    closest = min(SIGMA_INTERPRETATIONS.keys(), key=lambda x: abs(x - sigma_value))
    return SIGMA_INTERPRETATIONS[closest]


def format_sigma_display(dpmo_value: float) -> str:
    """
    Format sigma level for UI display.

    Examples:
        >>> format_sigma_display(6210)
        '4.0σ (6,210 DPMO)'
        >>> format_sigma_display(3.4)
        '6.0σ (3 DPMO)'
    """
    sigma = dpmo_to_sigma(dpmo_value)
    return f"{sigma:.1f}σ ({dpmo_value:,.0f} DPMO)"


# ============================================================================
# Self-test
# ============================================================================

def _self_test():
    """Verify sigma table integrity."""
    # Known values from Motorola table
    assert dpmo_to_sigma(3.4) == 6.0
    assert dpmo_to_sigma(6210) == 4.0
    assert dpmo_to_sigma(66807) == 3.0
    assert dpmo_to_sigma(308538) == 2.0

    # Reverse lookups
    assert sigma_to_dpmo(6.0) == 3.4
    assert sigma_to_dpmo(4.0) == 6210.0
    assert sigma_to_dpmo(3.0) == 66807.0

    # Monotonicity: higher DPMO = lower sigma
    assert dpmo_to_sigma(100) > dpmo_to_sigma(10000)
    assert dpmo_to_sigma(10000) > dpmo_to_sigma(100000)


_self_test()
