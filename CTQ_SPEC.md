# CTQ Specification — LLM Process Capability Measurement

## Scope
Measure LLM process capability across four capability pillars for arbitrary 
builder intents. Report Cpk, DPMO, sigma-level, and VoC-derived match score.

## Critical-to-Quality characteristics
- **Accuracy (mu)**: Mean score 0-100 on rubric-graded synthetic tests
- **Reliability (sigma)**: Standard deviation across >=5 trials per (model x test)
- **Cpk**: Process capability index against builder-specified LSL (default 70)
- **DPMO**: Defects per million opportunities, where defect = schema violation, 
  hallucination, timeout, or rubric score < LSL
- **Sigma level**: Derived from DPMO via standard Motorola conversion table

## Measurement system
- 5 trials per (model x test case) — minimum for reliable sigma per CLT
- 3 frontier judges per trial — Gauge R&R for measurement reliability
- Locked test generator (SHA pinned) — control for measurement drift
- Langfuse trace for every measurement — audit trail per ISO 9001 Clause 7.1.5

## Acceptance criteria for release
- Gauge R&R < 30% (measurement system contributes < 30% to total variance)
- Test generator stability confirmed via 5 gold-case ratchet
- No single candidate model takes > $0.10 per full evaluation

## Capability Pillars

Each builder intent is mapped to one or more of the following pillars:

| Pillar | What it measures | Example CTQ |
|--------|-----------------|-------------|
| **Structured Output** | JSON/schema compliance, field accuracy | Schema pass rate >= 95%, field accuracy Cpk >= 1.33 |
| **Language Fidelity** | Indic/multilingual generation quality | Target language score >= 85, code-switch rate < 5% |
| **Reasoning** | Multi-step logic, math, analytical tasks | Logical coherence >= 80, step completion >= 90% |
| **Creative Generation** | Open-ended text quality, tone matching | Rubric score >= 75, tone match >= 80% |

## Voice of Customer (VoC) to CTQ Translation

```
INPUT (VoC): Plain-English builder intent
  e.g., "Hindi WhatsApp bot for kirana store owners that generates 
         inventory orders from voice notes"

OUTPUT (CTQ):
{
  "ctq_characteristics": [
    {"name": "indic_fluency", "target": 90, "lsl": 85, "usl": 100, "weight": 0.35},
    {"name": "structured_output", "target": 95, "lsl": 90, "usl": 100, "weight": 0.30},
    {"name": "task_accuracy", "target": 88, "lsl": 80, "usl": 100, "weight": 0.25},
    {"name": "latency_ms", "target": 1500, "lsl": 0, "usl": 2000, "weight": 0.10}
  ],
  "hardware_tier": "mid",
  "budget_envelope": {
    "max_cost_per_1k_tokens": 0.005,
    "max_cost_per_evaluation": 0.10
  },
  "primary_pillar": "structured_output",
  "secondary_pillars": ["language_fidelity"]
}
```

## Process Capability Reporting

For each candidate model evaluated, PRISM reports:

```
{
  "model_id": "sarvam-m-24b",
  "intent": "Hindi JSON extraction for kirana inventory",
  "n_trials": 5,
  "n_judges": 3,
  "measurements": {
    "mu": 87.3,
    "sigma": 4.2,
    "cpk": 1.37,
    "dpmo": 5400,
    "sigma_level": 4.1,
    "gauge_rr_pct": 18.2
  },
  "verdict": "production_grade",
  "confidence": "high"
}
```

## Specification Limits

| Parameter | Default LSL | Default USL | Adjustable by Builder |
|-----------|------------|------------|----------------------|
| Composite Score | 70 | 100 | Yes (LSL only) |
| Latency (ms) | 0 | 2000 | Yes |
| Cost per 1K tokens ($) | 0 | 0.01 | Yes |
| Schema Compliance (%) | 90 | 100 | Yes (LSL only) |

---

*This specification is locked pre-hackathon. SHA recorded at commit time.*
