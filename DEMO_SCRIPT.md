# PRISM Demo Script — 3-Minute Pitch

**Product:** PRISM — Process Reliability Index for Supplier Models  
**Builder:** Neekhil | Six Sigma Black Belt | 8 years Amazon & Adobe  
**Track:** MaaS | **Duration:** 3:00  

---

## Opening Hook (30 seconds)

> "In 1986, Motorola invented Six Sigma because 99% quality still meant 10,000 defects per million. Manufacturing learned this lesson 40 years ago. The LLM industry hasn't.
>
> I'm a Six Sigma Black Belt. I spent 8 years running process excellence at Amazon and Adobe. Watch what happens when you apply the same rigor to model selection that you'd apply to a factory floor."

---

## Backend Magic Moment (75 seconds)

> "Judge picks a pillar — let's do structured output on Indic text."

**[Click submit on dashboard]**

> "Watch. Three things happen in parallel:"

**[Point to screen as results stream in]**

> "First, my test generator — locked, SHA-committed to GitHub before this hackathon started — produces a zero-day test case. No model has seen this."

**[Test case streams in]**

> "Second, five candidate models receive the test and respond."

**[Responses streaming]**

> "Third, three frontier judges — Claude Opus, GPT, Gemini — score every response. This is **Gauge R&R**, the Six Sigma methodology for validating measurement systems. If the judges disagree too much, the measurement itself is suspect and the trial is flagged."

**[σ bars update]**

> "Total time: 20 seconds. Total cost: 15 cents."

---

## Frontend Magic Moment (60 seconds)

> "Now the Voice of Customer."

**[Type live into the input]:**  
`I want to build a WhatsApp bot for Hindi-speaking kirana store owners that generates inventory orders from voice notes`

**[Intent parse appears — CTQ characteristics shown]**

> "This is translated into Critical-to-Quality characteristics — Indic fluency must be ≥85, structured-output Cpk must be ≥1.33, latency under 2 seconds, cost under ₹5 per 1K tokens."

**[Three cards slide in]**

> "Top card: Sarvam-M 24B. Match Score 87. But here's the insight —"

**[Point at the big Cpk number]**

> "The Cpk is 1.47. Sigma level 4.3. DPMO 5,400. Every quality engineer in this room knows what those numbers mean. **This is a qualified supplier.**"

**[Point at second card]**

> "Below it: Qwen 72B. Higher μ, yes, but Cpk 0.92 and sigma level 3.1 — not production-grade."

**[Click 'Show Control Chart' on top card]**

> "No existing leaderboard will tell you this because they're stuck measuring peak performance in 1985."

---

## The Closer (30 seconds)

> "I built this in 4 hours with OpenCode. Three frontier models orchestrated in parallel, writing every line of code I never touched.
>
> OpenCode is Six Sigma for developers choosing between frontier AI models. My product is Six Sigma for builders choosing between the 2.1 million open models downstream of them.
>
> I'm open-sourcing this tonight because the moat isn't the code. The moat is 40 years of industrial quality engineering the LLM industry has never heard of. That I can't copy out of my head."

---

## Key Vocabulary Hits (must land all 5)

- [ ] **Cpk** — "Process Capability Index, the number that tells you if a supplier is production-grade"
- [ ] **DPMO** — "Defects Per Million Opportunities — how Motorola, GE, and Toyota grade suppliers"
- [ ] **Gauge R&R** — "Three judges validating the measurement system before qualifying models"
- [ ] **Voice of Customer → CTQ** — "Plain English translated to measurable specification limits"
- [ ] **σ-level** — "4.2 sigma means 6,210 defects per million. Three sigma means 66,000. You wouldn't let a Three Sigma supplier into your factory."

---

## Q&A Defense Cheat Sheet

**"Isn't this just another leaderboard?"**
> "Leaderboards rank on μ. I rank on Cpk. A leaderboard tells you a model scored 95% once. I tell you it has Cpk 1.67 — production-grade. The model that beats it on MMLU has Cpk 0.83 — not even Three Sigma."

**"How is this not wrapping existing APIs?"**
> "Stripe wraps bank APIs. The bank isn't the moat. I'm applying DMAIC to an industry that has never had it. You don't ask the supplier to qualify themselves."

**"What stops HuggingFace from building this?"**
> "They employ ML researchers. They don't employ quality engineers. This took 8 years of muscle memory, not a month of hacking."

---

## Pre-Demo Checklist

- [ ] Backend running: `PRISM_DEMO_MODE=true python -m uvicorn app.main:app --port 8000`
- [ ] Frontend running: `cd frontend && npm run dev`
- [ ] Browser open to `http://localhost:3000`
- [ ] Test intent pre-typed (but will type live for drama)
- [ ] Control chart visible on at least one card
- [ ] Admin page shows cost and evaluator SHA
- [ ] Repo public: https://github.com/vn-envy/prism

---

## Timing Marks

| Time | Beat |
|------|------|
| 0:00 | "In 1986..." |
| 0:30 | "Judge picks a pillar..." |
| 1:45 | "Now the Voice of Customer..." |
| 2:45 | "I built this in 4 hours..." |
| 3:00 | END |

---

*Rehearse 3 times before submission. Hit every vocabulary word. Mean it.*
