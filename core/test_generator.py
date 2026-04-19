"""
PRISM Test Generator — Novel Test Case Synthesis for LLM Evaluation

Generates fresh, intent-specific test cases using a frontier LLM (Claude Opus).
Test cases include explicit `defect_criteria` that enumerate the failure modes
counted as DPMO opportunities in the Six Sigma capability calculation.

Design principles:
    1. Novelty — test cases are generated dynamically, never cached from public
       benchmarks. This prevents measurement contamination via training-data leak.
    2. Intent-specificity — prompts reflect the builder's actual CTQ characteristics,
       not a generic eval. A Hindi kirana bot is tested on Hindi kirana flows.
    3. Defect enumeration — every test case lists its failure modes explicitly.
       These become the `opportunities` denominator in DPMO = defects / opp * 1e6.
    4. Observability — every generation is traced via Langfuse for audit.

LOCKED: Generator prompt is SHA-pinned. See CTQ_SPEC.md for measurement-system rules.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any, Dict, Optional

from dotenv import load_dotenv

# Langfuse @observe — degrades to a no-op if langfuse is unavailable
try:
    from langfuse.decorators import observe
except Exception:  # pragma: no cover — only hit in stripped-down envs
    def observe(*_args, **_kwargs):  # type: ignore[misc]
        def _wrap(fn):
            return fn
        return _wrap

import openai

load_dotenv()


# ============================================================================
# CONSTANTS
# ============================================================================

GENERATOR_MODEL = "claude-opus-4-20250514"
GENERATOR_MAX_TOKENS = 2048
GENERATOR_TEMPERATURE = 0.9  # High temp → novel, non-repeating test cases

DEFAULT_TIMEOUT_MS = 30_000

# Pillars mapped to their primary quality dimension for prompt-shaping.
SUPPORTED_PILLARS = {
    "structured_output",
    "language_fidelity",
    "reasoning",
    "creative_generation",
}

# Pillar-specific guidance injected into the generator prompt.
_PILLAR_GUIDANCE: Dict[str, str] = {
    "structured_output": (
        "Design a task that requires producing valid JSON matching a strict schema "
        "(nested objects, enums, numeric types). The prompt must imply the schema "
        "clearly so a competent model could conform without being handed it literally. "
        "Set expected_format to 'json' and list the REQUIRED top-level fields."
    ),
    "language_fidelity": (
        "Design a task where the model must answer in a non-English target language "
        "(Hindi, Tamil, Bengali, Marathi, etc., as implied by the intent). Code-switching, "
        "transliteration, or English leakage counts as a wrong_language defect. "
        "Set expected_format to 'text' or 'markdown' as appropriate."
    ),
    "reasoning": (
        "Design a multi-step logical or analytical task where the final answer depends on "
        "chaining intermediate steps. A short-circuit or skipped step is a defect. "
        "Include enough context that the reasoning path is verifiable."
    ),
    "creative_generation": (
        "Design an open-ended generation task with tone and constraint requirements "
        "(length, style, audience). Off-tone or off-constraint output is a defect."
    ),
}


# ============================================================================
# PROMPT TEMPLATES
# ============================================================================

_SYSTEM_PROMPT = """You are the PRISM Test Case Generator — part of a Six Sigma \
measurement system for evaluating LLM process capability. Your job is to \
manufacture one novel test case for a specific builder intent.

Hard rules:
1. Output MUST be a single JSON object. No prose, no markdown fences, no commentary.
2. The test must be NOVEL. Do not reuse prompts from MMLU, HELM, BIG-bench, \
GSM8K, HumanEval, or any public benchmark.
3. The test must exercise the specified capability pillar given the builder's intent.
4. `defect_criteria` MUST enumerate the failure modes a judge can check. These \
define the DPMO opportunities. You MUST include at minimum: schema_violation, \
wrong_language, hallucination, timeout_ms, required_fields.
5. The prompt should be realistic — something a production system would actually face."""


_USER_TEMPLATE = """Generate ONE test case.

INTENT (Voice of Customer):
{intent}

CAPABILITY PILLAR: {pillar}
PILLAR GUIDANCE: {pillar_guidance}

CTQ CHARACTERISTICS (builder's Critical-to-Quality targets):
{ctq_json}

TRIAL NUMBER: {trial_n}
(Generate a DIFFERENT test case than you would for other trial numbers. \
Vary the scenario, entities, and edge conditions.)

Return JSON with EXACTLY this shape:
{{
  "prompt": "The actual text to send to candidate models. Self-contained.",
  "expected_format": "json" | "markdown" | "text",
  "defect_criteria": {{
    "schema_violation": "Concrete description of what counts as a schema failure for this prompt",
    "wrong_language": "Expected language and what constitutes leakage/code-switch",
    "hallucination": "What would be considered hallucinated / fabricated content here",
    "timeout_ms": 30000,
    "required_fields": ["<field names the output must contain>"]
  }},
  "difficulty": "easy" | "medium" | "hard",
  "ctq_targets": {{ "<ctq_name>": <numeric_target>, ... }}
}}

Respond with the JSON object only."""


# ============================================================================
# HELPERS
# ============================================================================

def _extract_json(raw: str) -> Dict[str, Any]:
    """Extract a JSON object from a model response, tolerating minor noise.

    Claude usually obeys "JSON only", but we guard against stray fences or
    leading/trailing whitespace defensively.
    """
    text = raw.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback: find the outermost {...} block
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError(f"Generator returned non-JSON output: {raw[:200]!r}")
        return json.loads(match.group(0))


def _normalize_defect_criteria(
    raw_criteria: Any,
    pillar: str,
    intent: str,
) -> Dict[str, Any]:
    """Guarantee the DPMO opportunity schema is fully populated.

    Even if the generator forgets a field, we fill it in — this is a
    measurement-system invariant (each test case must expose the same set
    of opportunities to make DPMO comparable across tests).
    """
    criteria: Dict[str, Any] = dict(raw_criteria) if isinstance(raw_criteria, dict) else {}

    criteria.setdefault(
        "schema_violation",
        "Output does not parse as the expected format or omits required fields."
        if pillar == "structured_output"
        else "Output violates the stated structural constraints of the prompt.",
    )
    criteria.setdefault(
        "wrong_language",
        "Response is not in the language implied by the intent, or code-switches to English."
        if pillar == "language_fidelity"
        else "Response is not in the language the prompt was issued in.",
    )
    criteria.setdefault(
        "hallucination",
        "Response asserts entities, numbers, or facts not grounded in the prompt.",
    )

    timeout = criteria.get("timeout_ms", DEFAULT_TIMEOUT_MS)
    try:
        criteria["timeout_ms"] = int(timeout)
    except (TypeError, ValueError):
        criteria["timeout_ms"] = DEFAULT_TIMEOUT_MS

    required = criteria.get("required_fields", [])
    if not isinstance(required, list):
        required = []
    criteria["required_fields"] = [str(f) for f in required]

    return criteria


def _validate_pillar(pillar: str) -> str:
    if pillar not in SUPPORTED_PILLARS:
        raise ValueError(
            f"Unsupported pillar {pillar!r}. Must be one of {sorted(SUPPORTED_PILLARS)}."
        )
    return pillar


# ============================================================================
# PUBLIC API
# ============================================================================

@observe(name="prism.generate_test_case")
async def generate_test_case(
    intent: str,
    pillar: str,
    ctq_characteristics: Dict[str, Any],
    trial_n: int = 1,
) -> Dict[str, Any]:
    """Generate one novel PRISM test case for a given builder intent and pillar.

    Args:
        intent: Plain-English Voice-of-Customer statement from the builder,
            e.g. "Hindi WhatsApp bot that extracts kirana inventory orders from voice notes".
        pillar: One of ``structured_output``, ``language_fidelity``, ``reasoning``,
            or ``creative_generation``. Selects the capability being exercised.
        ctq_characteristics: Builder's Critical-to-Quality targets (see CTQ_SPEC.md).
            Passed to the generator so test difficulty matches the builder's LSLs.
        trial_n: Trial index (1..N). Used to diversify generation across the
            5-trial block required by the measurement system.

    Returns:
        A dict conforming to the PRISM test-case schema:

        .. code-block:: json

            {
              "test_id": "uuid",
              "intent": "...",
              "pillar": "...",
              "prompt": "...",
              "expected_format": "json|markdown|text",
              "defect_criteria": {
                "schema_violation": "...",
                "wrong_language": "...",
                "hallucination": "...",
                "timeout_ms": 30000,
                "required_fields": ["..."]
              },
              "difficulty": "medium",
              "ctq_targets": { ... }
            }

    Raises:
        ValueError: If ``pillar`` is not supported or the generator returns
            non-JSON / malformed output that cannot be recovered.
        RuntimeError: If ``ANTHROPIC_API_KEY`` is not configured.
    """
    _validate_pillar(pillar)

    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise RuntimeError("OPENAI_API_KEY not set — required for test generation. Add it to .env")
    client = openai.AsyncOpenAI(api_key=openai_key)
    model_name = "gpt-4o-mini"  # Fast, capable for test case generation

    user_prompt = _USER_TEMPLATE.format(
        intent=intent.strip(),
        pillar=pillar,
        pillar_guidance=_PILLAR_GUIDANCE[pillar],
        ctq_json=json.dumps(ctq_characteristics, ensure_ascii=False, indent=2),
        trial_n=trial_n,
    )

    response = await client.chat.completions.create(
        model=model_name,
        max_tokens=GENERATOR_MAX_TOKENS,
        temperature=GENERATOR_TEMPERATURE,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    raw_text = (response.choices[0].message.content or "").strip()

    if not raw_text:
        raise ValueError("Generator returned an empty response.")

    parsed = _extract_json(raw_text)

    # Assemble the final test-case envelope.
    expected_format = parsed.get("expected_format", "text")
    if expected_format not in {"json", "markdown", "text"}:
        expected_format = "text"

    defect_criteria = _normalize_defect_criteria(
        parsed.get("defect_criteria"), pillar, intent
    )

    difficulty = parsed.get("difficulty", "medium")
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = "medium"

    ctq_targets = parsed.get("ctq_targets") or {}
    if not isinstance(ctq_targets, dict):
        ctq_targets = {}

    prompt_text = parsed.get("prompt")
    if not isinstance(prompt_text, str) or not prompt_text.strip():
        raise ValueError("Generator returned a test case with no prompt.")

    return {
        "test_id": str(uuid.uuid4()),
        "intent": intent,
        "pillar": pillar,
        "prompt": prompt_text.strip(),
        "expected_format": expected_format,
        "defect_criteria": defect_criteria,
        "difficulty": difficulty,
        "ctq_targets": ctq_targets,
    }


__all__ = [
    "generate_test_case",
    "SUPPORTED_PILLARS",
    "DEFAULT_TIMEOUT_MS",
]
