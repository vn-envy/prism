"""Pydantic models for the PRISM API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class MeasureRequest(BaseModel):
    """Request body for the /measure endpoint."""

    intent: str = Field(..., description="Natural-language description of the task to evaluate")
    pillar: Optional[str] = Field(
        None,
        description="Optional quality pillar filter (e.g. 'accuracy', 'safety')",
    )
    n_trials: int = Field(5, ge=1, le=30, description="Number of repeated trials per model")
    lsl: float = Field(70.0, ge=0, le=100, description="Lower Specification Limit (0-100 scale)")


class ModelResult(BaseModel):
    """Per-model statistical results from the measurement run."""

    model_id: str = Field(..., description="Full model identifier (e.g. 'anthropic/claude-opus-4')")
    short_name: str = Field(..., description="Human-friendly short name")
    mu: float = Field(..., description="Mean composite score across trials")
    sigma: float = Field(..., description="Standard deviation of composite scores")
    cpk: float = Field(..., description="Process Capability Index (Cpk)")
    dpmo: float = Field(..., description="Defects Per Million Opportunities")
    sigma_level: float = Field(..., description="Six Sigma level")
    match_score: float = Field(..., description="Intent-match score (0-100)")
    verdict: str = Field(..., description="Human-readable verdict (e.g. '4.2σ — Capable')")
    gauge_rr_pct: float = Field(
        ...,
        description="Gauge R&R percentage — measurement system variation",
    )
    cost_usd: float = Field(..., description="Total cost in USD for this model's trials")
    latency_ms: float = Field(..., description="Average latency in milliseconds")
    trial_scores: Optional[list[float]] = Field(
        None, description="Raw composite scores per trial (for control chart rendering)"
    )
    lsl: Optional[float] = Field(
        None, description="Lower Specification Limit used for this evaluation"
    )
    parameters_b: Optional[float] = Field(
        None, description="Model parameter count in billions"
    )
    hardware_tier: Optional[str] = Field(
        None, description="Hardware tier: low/mid/high"
    )


class MeasureResponse(BaseModel):
    """Response from the /measure endpoint."""

    model_results: list[ModelResult] = Field(
        ..., description="Ranked list of model results"
    )
    wall_clock_seconds: float = Field(
        ..., description="Total wall-clock time for the measurement run"
    )
    total_cost_usd: float = Field(
        ..., description="Aggregate cost across all models and trials"
    )
    trace_url: Optional[str] = Field(
        None, description="Langfuse trace URL for full observability"
    )


class HealthResponse(BaseModel):
    """Response from the /health endpoint."""

    status: str = Field(..., description="Service status ('ok' or 'degraded')")
    evaluator_sha: str = Field(
        ..., description="Git SHA or hash of the evaluator prompt template"
    )
    models_available: list[str] = Field(
        ..., description="List of model IDs available for evaluation"
    )
    langfuse_connected: bool = Field(
        ..., description="Whether Langfuse observability is connected"
    )
