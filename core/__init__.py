"""PRISM core — measurement pipeline primitives.

Exports the test-case generator used by the evaluator to manufacture
novel, intent-specific trials for the Six Sigma capability assessment.
"""

from core.test_generator import (
    DEFAULT_TIMEOUT_MS,
    SUPPORTED_PILLARS,
    generate_test_case,
)

__all__ = [
    "generate_test_case",
    "SUPPORTED_PILLARS",
    "DEFAULT_TIMEOUT_MS",
]
