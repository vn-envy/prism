# PRISM — Process Reliability Index for Supplier Models

**The first application of Six Sigma statistical process control to LLM selection.**

Every other LLM evaluation tool measures peak performance (μ). PRISM measures **process capability** (Cpk) — because a model that scores 95% once but varies wildly is worse for production than a model that scores 90% every single time.

> "You wouldn't let a Three Sigma supplier into your factory. Why is the LLM industry letting them into production?"

---

## The Core Insight

| Model | μ (mean) | σ (std dev) | Cpk | Verdict |
|-------|----------|-------------|-----|---------|
| Model A | 92% | 2% | **1.17** | Marginal — monitor |
| Model B | 95% | 8% | **0.42** | Incapable — will break |

Every leaderboard ranks Model B higher. Every quality engineer ranks Model A higher. **PRISM ranks like a quality engineer.**

---

## What PRISM Reports

For every candidate model evaluated against your intent:

- **Cpk** — Process Capability Index (≥1.33 = production-grade)
- **DPMO** — Defects Per Million Opportunities (Six Sigma universal metric)
- **σ-level** — Sigma level (4σ = acceptable, 6σ = world class)
- **Gauge R&R** — Measurement system reliability (3-judge panel validated)
- **MatchScore** — Bayesian posterior combining measured performance + HF priors

---

## Architecture

```
PRISM/
├── measure.py              ← CLI entry point
├── scoring_formula.py      ← Locked evaluator (Cpk, DPMO, Gauge R&R)
├── sigma_table.py          ← Motorola Six Sigma conversion table
├── evaluator_v1.md         ← Locked evaluation rubric (SHA: 937202df)
├── CTQ_SPEC.md             ← Critical-to-Quality specification
├── rubric_weights.json     ← Dimension weights config
├── hf_archive.json         ← 25 candidate models with HF priors
│
├── core/
│   ├── autoresearch.py     ← 5-trial × 3-judge measurement engine
│   ├── test_generator.py   ← Novel test case generation (SHA-locked)
│   ├── voc_parser.py       ← Voice of Customer → CTQ translation
│   ├── judge_panel.py      ← 3-frontier Gauge R&R (Opus, GPT, Gemini)
│   └── cpk_calculator.py   ← Six Sigma statistics bridge
│
├── app/
│   ├── main.py             ← FastAPI server
│   ├── database.py         ← Postgres/SQLite measurement storage
│   ├── models.py           ← Pydantic API schemas
│   └── routes/measure.py   ← POST /measure, GET /health
│
└── frontend/               ← Next.js 14 + Tailwind
    ├── app/page.tsx        ← Main dashboard (VoC input → Nutrition Label cards)
    ├── app/memory/         ← Memory Explorer (historical Shewhart charts)
    ├── app/admin/          ← Control Plan (cost, drift, evaluator SHA)
    └── app/components/     ← ModelCard, ControlChart, CpkDisplay, SigmaBadge
```

---

## Quick Start

### Demo Mode (no API keys required)

```bash
# Backend
PRISM_DEMO_MODE=true python3 -m uvicorn app.main:app --port 8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:3000 and type an intent.

### Live Mode (with API keys)

```bash
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, TOGETHER_API_KEY

python3 -m uvicorn app.main:app --port 8000
cd frontend && npm run dev
```

### CLI

```bash
# Demo mode
PRISM_DEMO_MODE=true python3 measure.py --intent "Hindi JSON extraction for kirana inventory" --output result.json

# Smoke test (baseline DPMO)
python3 measure.py --smoke-test --output baseline.json
```

---

## Six Sigma Concepts Applied

| Concept | Manufacturing | PRISM |
|---------|--------------|-------|
| **Cpk** | Supplier capability vs spec | Model output quality vs builder's minimum |
| **DPMO** | Defects per million parts | Failed outputs per million LLM calls |
| **Gauge R&R** | Caliper calibration | 3-judge panel agreement validation |
| **VoC → CTQ** | Customer needs → measurable specs | Plain English → LSL/USL/target |
| **SPC** | Control charts for drift detection | Ratchet on gold-case Cpk |

---

## Measurement Protocol

- **5 trials** per (model × test case) — minimum for reliable σ per CLT
- **3 frontier judges** per trial — Gauge R&R for measurement reliability
- **Locked test generator** (SHA pinned) — control for measurement drift
- **90s wall-clock** budget per intent
- **$0.50 cost cap** per intent
- **Bayesian posterior**: 0.3 × HF prior + 0.7 × measured likelihood

---

## Evaluator Integrity

The evaluator was committed publicly **before** the hackathon started:

```
Commit SHA: 937202df1bb5b277e68ab0f749e827faf0f6eec4
Timestamp: 2026-04-19 12:24:21 +0530
```

This proves the evaluation criteria were not tuned to fit the results.

---

## Built With

- **Python** + **FastAPI** (backend)
- **Next.js 14** + **Tailwind CSS** (frontend)
- **SQLite/Postgres** (measurement storage)
- **Anthropic**, **OpenAI**, **Google** APIs (3-judge Gauge R&R panel)
- **Together AI** (candidate model inference)
- **OpenCode** (orchestration IDE)

---

## The Moat

The moat is not the code. Anyone can compute Cpk.

The moat is **40 years of industrial quality engineering methodology** — Cpk, DPMO, Gauge R&R, VoC→CTQ, Statistical Process Control — correctly assembled and applied to a new domain for the first time.

The code is open-source. The expertise is not.

---

*Built by Neekhil | Six Sigma Black Belt | 8 years Amazon & Adobe*
