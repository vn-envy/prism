"""
PRISM — Voice of Customer (VoC) → Critical-to-Quality (CTQ) translation.

In Six Sigma terms:
    VoC = what the customer says in their own words
    CTQ = the measurable specification manufacturing uses

This module uses a frontier LLM (Claude) to intelligently translate a plain-
English builder intent into a structured CTQ contract with specification
limits (LSL / USL / target / weight), a hardware tier, a budget envelope,
and the capability pillars that matter for the intent.

It then exposes `filter_candidates` which applies those CTQ constraints
against the archived HF-leaderboard priors in `hf_archive.json` and returns
a short list of candidate models to evaluate.

Usage:
    from prism.core.voc_parser import parse_intent, filter_candidates

    ctq = await parse_intent("Hindi WhatsApp bot for kirana store owners")
    candidates = await filter_candidates(ctq, max_candidates=5)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Langfuse tracing — fall back to a no-op decorator if Langfuse is not wired
# up yet so the module remains importable in dev/test environments.
try:
    from langfuse.decorators import observe  # type: ignore
except Exception:  # pragma: no cover - defensive import
    def observe(*_args: Any, **_kwargs: Any):  # type: ignore
        def _decorator(fn):
            return fn
        return _decorator

import openai

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Use a strong frontier model for VoC parsing — this is a one-shot cost per
# intent, so we prefer reasoning quality over latency here.
_PARSER_MODEL = os.getenv("PRISM_VOC_MODEL", "claude-sonnet-4-5")

# Project root — `hf_archive.json` lives alongside the `prism/` package.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_HF_ARCHIVE_PATH = _PROJECT_ROOT / "hf_archive.json"

# Capability pillars recognized by PRISM (see CTQ_SPEC.md).
_VALID_PILLARS = {
    "structured_output",
    "language_fidelity",
    "reasoning",
    "creative_generation",
}

_VALID_HARDWARE_TIERS = {"low", "mid", "high"}
_VALID_COMPLEXITY = {"low", "medium", "high"}

# Indic language ISO-639-1 codes used by PRISM — matches the `supported_languages`
# field on Sarvam entries in hf_archive.json.
_INDIC_LANGUAGES = {"hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or"}

# System prompt that teaches Claude how to perform the VoC → CTQ translation.
_SYSTEM_PROMPT = """You are a Six Sigma quality engineer translating a builder's Voice of Customer (VoC) — a plain-English description of what they want to build with an LLM — into a measurable Critical-to-Quality (CTQ) specification.

You must output ONLY a single JSON object. No prose, no markdown fences, just JSON.

The JSON must have this exact shape:

{
  "ctq_characteristics": [
    {"name": "<ctq_name>", "target": <number 0-100 or ms>, "lsl": <number>, "usl": <number>, "weight": <0..1>}
  ],
  "hardware_tier": "low" | "mid" | "high",
  "budget_envelope": {
    "max_cost_per_1k_tokens": <usd float>,
    "max_cost_per_evaluation": <usd float>
  },
  "primary_pillar": "structured_output" | "language_fidelity" | "reasoning" | "creative_generation",
  "secondary_pillars": ["<pillar>", ...],
  "detected_languages": ["<iso-639-1>", ...],
  "complexity_level": "low" | "medium" | "high"
}

Rules:
1. ctq_characteristics weights MUST sum to 1.0 (±0.01). Include 2-5 items.
2. Common CTQ names: indic_fluency, structured_output, task_accuracy, reasoning_quality, creative_quality, latency_ms, schema_compliance, tone_match.
3. For score-based CTQs (0-100), LSL is typically 70-90, USL is 100, target between them. Higher LSL = stricter.
4. For latency_ms: LSL=0, USL is the max acceptable ms (e.g. 2000), target is desired (e.g. 1500). Lower is better.
5. hardware_tier selection:
   - "low"  = simple classification, short responses, chat; <13B is fine
   - "mid"  = multi-step extraction, structured JSON, moderate reasoning; 14-40B
   - "high" = complex reasoning, long context, agentic, code generation; 70B+
6. budget_envelope defaults: low→(0.001, 0.02), mid→(0.003, 0.05), high→(0.01, 0.15). Adjust if the builder mentions cost/scale.
7. primary_pillar = the single most important capability. secondary_pillars = 0-2 supporting pillars.
8. detected_languages = ISO-639-1 codes. "en" if English, "hi" for Hindi, etc. Empty [] if language-agnostic.
9. complexity_level reflects overall task difficulty, informs n_trials downstream.
10. If the intent mentions any Indic language or Indian vernacular context, include an "indic_fluency" CTQ with weight >= 0.25 and language_fidelity in pillars.
11. If the intent mentions JSON / schema / structured / extraction / function calling, include a "structured_output" CTQ with weight >= 0.25 and structured_output as primary or secondary pillar.
"""


# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------

_anthropic_client: openai.AsyncOpenAI | None = None
_hf_archive_cache: dict[str, Any] | None = None


def _get_anthropic() -> openai.AsyncOpenAI:
    """Return an OpenAI client for VoC parsing. Uses OpenAI directly (gpt-4o)."""
    global _anthropic_client
    if _anthropic_client is None:
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            _anthropic_client = openai.AsyncOpenAI(api_key=openai_key)
        else:
            raise RuntimeError(
                "OPENAI_API_KEY not set — required for VoC parsing. Add it to .env"
            )
    return _anthropic_client


def _load_hf_archive() -> dict[str, Any]:
    global _hf_archive_cache
    if _hf_archive_cache is None:
        if not _HF_ARCHIVE_PATH.exists():
            raise FileNotFoundError(
                f"hf_archive.json not found at {_HF_ARCHIVE_PATH}. "
                "Expected at project root alongside the prism/ package."
            )
        with _HF_ARCHIVE_PATH.open("r", encoding="utf-8") as fh:
            _hf_archive_cache = json.load(fh)
    return _hf_archive_cache


# ---------------------------------------------------------------------------
# parse_intent
# ---------------------------------------------------------------------------

@observe(name="voc_parser.parse_intent")
async def parse_intent(intent: str) -> dict:
    """
    Translate a Voice-of-Customer builder intent into a CTQ specification.

    Args:
        intent: Plain-English description, e.g.
            "I want to build a Hindi WhatsApp bot for kirana store owners
             that generates inventory orders from voice notes."

    Returns:
        A dict conforming to the PRISM CTQ schema. See module docstring.
    """
    if not isinstance(intent, str) or not intent.strip():
        raise ValueError("intent must be a non-empty string")

    intent = intent.strip()
    client = _get_anthropic()

    user_message = (
        f"Builder intent (VoC):\n\n\"{intent}\"\n\n"
        "Translate this into a PRISM CTQ specification per the rules. "
        "Respond with the JSON object only."
    )

    try:
        model_name = "gpt-4o-mini"  # Fast, cheap, capable for VoC parsing
        response = await client.chat.completions.create(
            model=model_name,
            max_tokens=1500,
            temperature=0.0,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
        raw_text = response.choices[0].message.content or ""
        parsed = _safe_json_loads(raw_text)
    except Exception as exc:
        logger.exception("VoC parser LLM call failed: %s", exc)
        parsed = _heuristic_fallback(intent)

    ctq = _validate_and_normalize(parsed, intent)
    ctq["intent"] = intent
    return ctq


def _extract_text(response: Any) -> str:
    """Pull the text content from an Anthropic messages response."""
    try:
        blocks = response.content
    except AttributeError:
        return str(response)
    parts: list[str] = []
    for block in blocks:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "".join(parts).strip()


def _safe_json_loads(raw: str) -> dict[str, Any]:
    """Parse JSON out of an LLM response, tolerating code fences / prose."""
    if not raw:
        raise ValueError("empty LLM response")

    # Strip common markdown fences
    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", raw, re.DOTALL)
    if fenced:
        raw = fenced.group(1)

    # Find the first balanced {...} block as a last resort
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


# ---------------------------------------------------------------------------
# Validation / normalization
# ---------------------------------------------------------------------------

def _validate_and_normalize(parsed: dict[str, Any], intent: str) -> dict[str, Any]:
    """Ensure the LLM output conforms to the PRISM CTQ schema."""
    out: dict[str, Any] = {}

    # --- ctq_characteristics ---
    ctqs = parsed.get("ctq_characteristics") or []
    if not isinstance(ctqs, list) or not ctqs:
        ctqs = _default_ctqs(intent)

    cleaned_ctqs: list[dict[str, Any]] = []
    for item in ctqs:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip().lower().replace(" ", "_")
        if not name:
            continue
        try:
            target = float(item.get("target", 0))
            lsl = float(item.get("lsl", 0))
            usl = float(item.get("usl", 100))
            weight = float(item.get("weight", 0))
        except (TypeError, ValueError):
            continue
        if lsl > usl:
            lsl, usl = usl, lsl
        target = max(lsl, min(usl, target))
        cleaned_ctqs.append({
            "name": name,
            "target": target,
            "lsl": lsl,
            "usl": usl,
            "weight": max(0.0, weight),
        })

    if not cleaned_ctqs:
        cleaned_ctqs = _default_ctqs(intent)

    # Normalize weights to sum to 1.0
    total_w = sum(c["weight"] for c in cleaned_ctqs) or 1.0
    for c in cleaned_ctqs:
        c["weight"] = round(c["weight"] / total_w, 4)

    out["ctq_characteristics"] = cleaned_ctqs

    # --- hardware_tier ---
    tier = str(parsed.get("hardware_tier", "mid")).lower().strip()
    if tier not in _VALID_HARDWARE_TIERS:
        tier = "mid"
    out["hardware_tier"] = tier

    # --- budget_envelope ---
    budget = parsed.get("budget_envelope") or {}
    defaults = {
        "low": (0.001, 0.02),
        "mid": (0.003, 0.05),
        "high": (0.01, 0.15),
    }[tier]
    try:
        max_cost_1k = float(budget.get("max_cost_per_1k_tokens", defaults[0]))
    except (TypeError, ValueError):
        max_cost_1k = defaults[0]
    try:
        max_cost_eval = float(budget.get("max_cost_per_evaluation", defaults[1]))
    except (TypeError, ValueError):
        max_cost_eval = defaults[1]
    out["budget_envelope"] = {
        "max_cost_per_1k_tokens": max_cost_1k,
        "max_cost_per_evaluation": max_cost_eval,
    }

    # --- pillars ---
    primary = str(parsed.get("primary_pillar", "")).lower().strip()
    if primary not in _VALID_PILLARS:
        primary = _infer_primary_pillar(cleaned_ctqs, intent)
    out["primary_pillar"] = primary

    secondary_raw = parsed.get("secondary_pillars") or []
    if not isinstance(secondary_raw, list):
        secondary_raw = []
    secondary = []
    for p in secondary_raw:
        p = str(p).lower().strip()
        if p in _VALID_PILLARS and p != primary and p not in secondary:
            secondary.append(p)
    out["secondary_pillars"] = secondary[:2]

    # --- detected_languages ---
    langs_raw = parsed.get("detected_languages") or []
    if not isinstance(langs_raw, list):
        langs_raw = []
    langs = []
    for code in langs_raw:
        code = str(code).lower().strip()
        if re.fullmatch(r"[a-z]{2,3}", code) and code not in langs:
            langs.append(code)
    # Heuristic: Indic language mentioned in intent but missed by LLM
    heuristic_langs = _detect_languages_heuristic(intent)
    for code in heuristic_langs:
        if code not in langs:
            langs.append(code)
    out["detected_languages"] = langs

    # --- complexity_level ---
    complexity = str(parsed.get("complexity_level", "medium")).lower().strip()
    if complexity not in _VALID_COMPLEXITY:
        complexity = {"low": "low", "mid": "medium", "high": "high"}[tier]
    out["complexity_level"] = complexity

    return out


def _infer_primary_pillar(ctqs: list[dict[str, Any]], intent: str) -> str:
    """Infer primary pillar from CTQ names / intent text."""
    name_to_pillar = {
        "indic_fluency": "language_fidelity",
        "language_fidelity": "language_fidelity",
        "tone_match": "language_fidelity",
        "structured_output": "structured_output",
        "schema_compliance": "structured_output",
        "json_compliance": "structured_output",
        "reasoning_quality": "reasoning",
        "task_accuracy": "reasoning",
        "creative_quality": "creative_generation",
    }
    # Heaviest-weighted CTQ wins
    heaviest = max(ctqs, key=lambda c: c["weight"], default=None)
    if heaviest and heaviest["name"] in name_to_pillar:
        return name_to_pillar[heaviest["name"]]

    lowered = intent.lower()
    if any(w in lowered for w in ("json", "schema", "extract", "structured", "function call")):
        return "structured_output"
    if any(w in lowered for w in ("reason", "math", "logic", "analyze", "plan")):
        return "reasoning"
    if any(w in lowered for w in ("write", "creative", "story", "copy", "draft")):
        return "creative_generation"
    return "structured_output"


def _detect_languages_heuristic(intent: str) -> list[str]:
    """Cheap keyword fallback for language detection."""
    lowered = intent.lower()
    hits: list[str] = []
    keyword_map = {
        "hi": ("hindi", "devanagari", "hindustani"),
        "bn": ("bengali", "bangla"),
        "ta": ("tamil",),
        "te": ("telugu",),
        "mr": ("marathi",),
        "gu": ("gujarati",),
        "kn": ("kannada",),
        "ml": ("malayalam",),
        "pa": ("punjabi",),
        "or": ("odia", "oriya"),
        "en": ("english",),
    }
    for code, kws in keyword_map.items():
        if any(kw in lowered for kw in kws):
            hits.append(code)
    # Detect Devanagari / other Indic scripts in the intent itself
    if re.search(r"[\u0900-\u097F]", intent):
        if "hi" not in hits:
            hits.append("hi")
    return hits


def _default_ctqs(intent: str) -> list[dict[str, Any]]:
    """Safe default CTQ set when the LLM output is unusable."""
    has_indic = bool(_detect_languages_heuristic(intent)) and \
                any(c in _INDIC_LANGUAGES for c in _detect_languages_heuristic(intent))
    if has_indic:
        return [
            {"name": "indic_fluency",     "target": 90,   "lsl": 85, "usl": 100,  "weight": 0.35},
            {"name": "structured_output", "target": 95,   "lsl": 90, "usl": 100,  "weight": 0.30},
            {"name": "task_accuracy",     "target": 88,   "lsl": 80, "usl": 100,  "weight": 0.25},
            {"name": "latency_ms",        "target": 1500, "lsl": 0,  "usl": 2000, "weight": 0.10},
        ]
    return [
        {"name": "task_accuracy",     "target": 88,   "lsl": 80, "usl": 100,  "weight": 0.45},
        {"name": "structured_output", "target": 92,   "lsl": 85, "usl": 100,  "weight": 0.35},
        {"name": "latency_ms",        "target": 1500, "lsl": 0,  "usl": 2000, "weight": 0.20},
    ]


def _heuristic_fallback(intent: str) -> dict[str, Any]:
    """Full-fallback CTQ if the LLM call itself fails."""
    langs = _detect_languages_heuristic(intent)
    has_indic = any(c in _INDIC_LANGUAGES for c in langs)
    primary = "language_fidelity" if has_indic else _infer_primary_pillar(
        _default_ctqs(intent), intent
    )
    return {
        "ctq_characteristics": _default_ctqs(intent),
        "hardware_tier": "mid",
        "budget_envelope": {
            "max_cost_per_1k_tokens": 0.003,
            "max_cost_per_evaluation": 0.05,
        },
        "primary_pillar": primary,
        "secondary_pillars": ["structured_output"] if primary != "structured_output" else [],
        "detected_languages": langs,
        "complexity_level": "medium",
    }


# ---------------------------------------------------------------------------
# filter_candidates
# ---------------------------------------------------------------------------

# Tier ordering — used to expand the allowable tier set: asking for "mid"
# should also accept "low" (cheaper, smaller) but not "high" (blows budget).
_TIER_ORDER = {"low": 0, "mid": 1, "high": 2}


@observe(name="voc_parser.filter_candidates")
async def filter_candidates(ctq: dict, max_candidates: int = 5) -> list:
    """
    Filter the HF archive for candidate models that match a CTQ contract.

    Filters applied:
        1. hardware_tier <= requested tier (allow smaller/cheaper)
        2. cost_per_1k_tokens_usd <= ctq.budget_envelope.max_cost_per_1k_tokens
        3. Boost for Indic-specialized models when detected_languages contains
           any Indic code.
        4. Rank by pillar-weighted prior score, then return top-N.

    Args:
        ctq: A CTQ dict as produced by `parse_intent`.
        max_candidates: Maximum number of candidates to return.

    Returns:
        A list of candidate dicts, each augmented with a `match_score` field
        explaining the rank. Empty list if no model passes the filters.
    """
    # `_load_hf_archive` is sync I/O but tiny and cached; offload once.
    archive = await asyncio.to_thread(_load_hf_archive)
    models: list[dict[str, Any]] = list(archive.get("models", []))

    requested_tier = ctq.get("hardware_tier", "mid")
    tier_cap = _TIER_ORDER.get(requested_tier, 1)

    budget = ctq.get("budget_envelope") or {}
    max_cost_1k = float(budget.get("max_cost_per_1k_tokens", 0.01))

    primary_pillar = ctq.get("primary_pillar", "structured_output")
    secondary_pillars = ctq.get("secondary_pillars") or []

    detected_languages = ctq.get("detected_languages") or []
    needs_indic = any(code in _INDIC_LANGUAGES for code in detected_languages)

    ctq_usl_latency = _get_ctq_usl(ctq, "latency_ms")

    scored: list[dict[str, Any]] = []

    for model in models:
        # --- Filter: hardware tier ---
        model_tier = model.get("hardware_tier", "mid")
        if _TIER_ORDER.get(model_tier, 99) > tier_cap:
            continue

        # --- Filter: cost budget ---
        cost_1k = float(model.get("cost_per_1k_tokens_usd", 0.0))
        if cost_1k > max_cost_1k:
            continue

        priors = model.get("prior_scores", {}) or {}

        # --- Score: pillar-weighted prior ---
        primary_score = float(priors.get(primary_pillar, 0.0))
        secondary_score = (
            sum(float(priors.get(p, 0.0)) for p in secondary_pillars)
            / max(len(secondary_pillars), 1)
            if secondary_pillars else 0.0
        )

        # 70% primary pillar, 20% secondary, 10% overall avg — gives partial
        # credit to well-rounded models without letting them beat specialists.
        avg_prior = float(model.get("avg_prior", 0.0))
        base_score = 0.7 * primary_score + 0.2 * secondary_score + 0.1 * avg_prior

        # --- Boost: Indic specialist when Indic languages requested ---
        indic_boost = 0.0
        specialization = (model.get("specialization") or "").lower()
        supported = set(model.get("supported_languages") or [])
        if needs_indic:
            if specialization == "indic_languages":
                indic_boost += 15.0
            overlap = supported.intersection(set(detected_languages))
            if overlap:
                indic_boost += 5.0 * len(overlap)  # +5 per matched language
                indic_boost = min(indic_boost, 25.0)

        # --- Soft penalty: latency overshoot vs CTQ USL ---
        latency_penalty = 0.0
        if ctq_usl_latency is not None:
            model_latency = float(model.get("avg_latency_ms", 0.0))
            if model_latency > ctq_usl_latency:
                overshoot_ratio = (model_latency - ctq_usl_latency) / ctq_usl_latency
                latency_penalty = min(20.0, 20.0 * overshoot_ratio)

        # --- Soft bonus: cheaper than budget (efficient use of spend) ---
        cost_bonus = 0.0
        if max_cost_1k > 0:
            cost_bonus = max(0.0, (1.0 - (cost_1k / max_cost_1k))) * 3.0  # up to +3

        match_score = base_score + indic_boost + cost_bonus - latency_penalty

        scored.append({
            **model,
            "match_score": round(match_score, 3),
            "score_breakdown": {
                "primary_pillar_score": round(primary_score, 2),
                "secondary_pillar_score": round(secondary_score, 2),
                "avg_prior": round(avg_prior, 2),
                "indic_boost": round(indic_boost, 2),
                "cost_bonus": round(cost_bonus, 2),
                "latency_penalty": round(latency_penalty, 2),
            },
        })

    scored.sort(key=lambda m: m["match_score"], reverse=True)
    return scored[: max(1, int(max_candidates))]


def _get_ctq_usl(ctq: dict, ctq_name: str) -> float | None:
    """Return the USL value for a named CTQ if present."""
    for c in ctq.get("ctq_characteristics", []):
        if c.get("name") == ctq_name:
            try:
                return float(c.get("usl"))
            except (TypeError, ValueError):
                return None
    return None


# ---------------------------------------------------------------------------
# CLI / smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import pprint
    import sys

    logging.basicConfig(level=logging.INFO)

    example = (
        " ".join(sys.argv[1:])
        or "I want to build a Hindi WhatsApp bot for kirana store owners "
           "that generates structured inventory orders from voice notes."
    )

    async def _main() -> None:
        ctq = await parse_intent(example)
        print("=== CTQ ===")
        pprint.pp(ctq)
        print("\n=== Top candidates ===")
        pprint.pp(await filter_candidates(ctq, max_candidates=5))

    asyncio.run(_main())
