"""PRISM — Process Reliability Index for Supplier Models.

FastAPI application entry-point.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.measure import router as measure_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-24s | %(levelname)-5s | %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="PRISM",
    description=(
        "Process Reliability Index for Supplier Models — "
        "Six Sigma statistical process control for LLM evaluation."
    ),
    version="0.1.0",
)

# CORS — wide-open for hackathon; lock down for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(measure_router)


# ---------------------------------------------------------------------------
# Lifecycle events
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def on_startup() -> None:
    """Initialise database and verify external connections."""
    # 1. Database
    from app.database import init_db

    await init_db()
    logger.info("Database ready")

    # 2. Langfuse
    try:
        from langfuse import Langfuse  # type: ignore[import-untyped]

        lf = Langfuse()
        lf.auth_check()
        logger.info("Langfuse connected")
    except Exception:
        logger.warning("Langfuse not available — tracing disabled")


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------

@app.get("/")
async def root() -> dict:
    """Project info."""
    return {
        "project": "PRISM",
        "full_name": "Process Reliability Index for Supplier Models",
        "description": (
            "Treat every LLM like a supplier on a manufacturing line. "
            "PRISM applies Six Sigma statistical process control to "
            "quantify model reliability with Cpk, DPMO, and sigma levels."
        ),
        "version": app.version,
        "docs": "/docs",
    }
