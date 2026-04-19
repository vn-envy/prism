"""Async database layer for PRISM — Postgres (asyncpg) with SQLite fallback."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    select,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine / session factory
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL", "")

_USE_SQLITE = False

if DATABASE_URL:
    # Normalise common Postgres URI schemes for asyncpg
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif not DATABASE_URL.startswith("postgresql+asyncpg://"):
        DATABASE_URL = f"postgresql+asyncpg://{DATABASE_URL}"
else:
    # Fallback: async SQLite for demo / local dev
    _USE_SQLITE = True
    _sqlite_path = os.path.join(os.path.dirname(__file__), "..", "prism_demo.db")
    DATABASE_URL = f"sqlite+aiosqlite:///{os.path.abspath(_sqlite_path)}"
    logger.warning("DATABASE_URL not set — using SQLite fallback at %s", _sqlite_path)

engine = create_async_engine(DATABASE_URL, echo=False, future=True)
async_session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------------------------------------------------------
# ORM base + table
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(
        String(36) if _USE_SQLITE else PG_UUID(as_uuid=True),
        primary_key=True,
        default=lambda: str(uuid.uuid4()) if _USE_SQLITE else uuid.uuid4(),
    )
    model_id = Column(String(256), nullable=False, index=True)
    test_case_id = Column(String(256), nullable=False)
    trial_n = Column(Integer, nullable=False)
    pillar = Column(String(128), nullable=False)
    frontier_judge = Column(String(128), nullable=False)
    score = Column(Float, nullable=False)
    task_accuracy = Column(Float, nullable=False)
    structural_compliance = Column(Float, nullable=False)
    language_fidelity = Column(Float, nullable=False)
    safety_groundedness = Column(Float, nullable=False)
    defect_flag = Column(Boolean, nullable=False, default=False)
    defect_type = Column(String(256), nullable=True)
    latency_ms = Column(Integer, nullable=False)
    cost_usd = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    trace_url = Column(Text, nullable=True)
    intent = Column(Text, nullable=False)
    evaluator_sha = Column(String(64), nullable=False)


# ---------------------------------------------------------------------------
# Async helpers
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """Create all tables if they don't already exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialised (backend=%s)", "sqlite" if _USE_SQLITE else "postgres")


async def store_measurement(data: dict) -> str:
    """Insert a single measurement row and return its id."""
    row = Measurement(**data)
    if row.id is None:
        row.id = str(uuid.uuid4()) if _USE_SQLITE else uuid.uuid4()
    if row.timestamp is None:
        row.timestamp = datetime.now(timezone.utc)

    async with async_session_factory() as session:
        async with session.begin():
            session.add(row)
        await session.commit()

    return str(row.id)


async def get_measurements(model_id: str, intent: str) -> list[dict]:
    """Return all measurements for a given model_id + intent combination."""
    async with async_session_factory() as session:
        stmt = (
            select(Measurement)
            .where(Measurement.model_id == model_id, Measurement.intent == intent)
            .order_by(Measurement.timestamp.desc())
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "model_id": r.model_id,
            "test_case_id": r.test_case_id,
            "trial_n": r.trial_n,
            "pillar": r.pillar,
            "frontier_judge": r.frontier_judge,
            "score": r.score,
            "task_accuracy": r.task_accuracy,
            "structural_compliance": r.structural_compliance,
            "language_fidelity": r.language_fidelity,
            "safety_groundedness": r.safety_groundedness,
            "defect_flag": r.defect_flag,
            "defect_type": r.defect_type,
            "latency_ms": r.latency_ms,
            "cost_usd": r.cost_usd,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "trace_url": r.trace_url,
            "intent": r.intent,
            "evaluator_sha": r.evaluator_sha,
        }
        for r in rows
    ]
