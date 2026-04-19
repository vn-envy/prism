/**
 * PRISM Demo-mode /api/measure route — Vercel serverless fallback.
 *
 * When deployed on Vercel (no Python FastAPI backend), this route generates
 * realistic simulated measurement data using deterministic seeded PRNG,
 * replicating the statistical pipeline from the Python backend.
 */

import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Types matching the Python MeasureResponse / ModelResult
// ---------------------------------------------------------------------------

interface MeasureRequest {
  intent: string;
  pillar?: string | null;
  n_trials: number;
  lsl: number;
}

interface ModelResult {
  model_id: string;
  short_name: string;
  mu: number;
  sigma: number;
  cpk: number;
  dpmo: number;
  sigma_level: number;
  match_score: number;
  verdict: string;
  gauge_rr_pct: number;
  cost_usd: number;
  latency_ms: number;
  trial_scores: number[];
  lsl: number;
  parameters_b: number;
  hardware_tier: string;
}

interface MeasureResponse {
  model_results: ModelResult[];
  wall_clock_seconds: number;
  total_cost_usd: number;
  trace_url: string | null;
}

// ---------------------------------------------------------------------------
// Hardcoded model archive (subset of hf_archive.json)
// ---------------------------------------------------------------------------

interface ArchiveModel {
  model_id: string;
  short_name: string;
  parameters_b: number;
  hardware_tier: string;
  prior_scores: Record<string, number>;
  avg_prior: number;
  cost_per_1k_tokens_usd: number;
  avg_latency_ms: number;
  provider: string;
  specialization?: string;
}

const MODEL_ARCHIVE: ArchiveModel[] = [
  {
    model_id: "meta-llama/Llama-3.1-70B-Instruct",
    short_name: "Llama 3.1 70B",
    parameters_b: 70,
    hardware_tier: "high",
    prior_scores: { reasoning: 82.5, structured_output: 78.3, language_fidelity: 71.2, creative_generation: 79.8 },
    avg_prior: 77.95,
    cost_per_1k_tokens_usd: 0.0035,
    avg_latency_ms: 2800,
    provider: "together",
  },
  {
    model_id: "mistralai/Mistral-Large-2",
    short_name: "Mistral Large 2",
    parameters_b: 123,
    hardware_tier: "high",
    prior_scores: { reasoning: 84.1, structured_output: 81.7, language_fidelity: 75.3, creative_generation: 82.0 },
    avg_prior: 80.78,
    cost_per_1k_tokens_usd: 0.008,
    avg_latency_ms: 3200,
    provider: "mistral",
  },
  {
    model_id: "Qwen/Qwen2.5-72B-Instruct",
    short_name: "Qwen 2.5 72B",
    parameters_b: 72,
    hardware_tier: "high",
    prior_scores: { reasoning: 83.7, structured_output: 85.2, language_fidelity: 80.1, creative_generation: 78.4 },
    avg_prior: 81.85,
    cost_per_1k_tokens_usd: 0.004,
    avg_latency_ms: 2600,
    provider: "together",
  },
  {
    model_id: "google/gemma-2-27b-it",
    short_name: "Gemma 2 27B",
    parameters_b: 27,
    hardware_tier: "mid",
    prior_scores: { reasoning: 74.6, structured_output: 76.2, language_fidelity: 69.8, creative_generation: 73.5 },
    avg_prior: 73.53,
    cost_per_1k_tokens_usd: 0.0015,
    avg_latency_ms: 1400,
    provider: "together",
  },
  {
    model_id: "sarvamai/sarvam-m-24b",
    short_name: "Sarvam-M 24B",
    parameters_b: 24,
    hardware_tier: "mid",
    prior_scores: { reasoning: 71.2, structured_output: 74.8, language_fidelity: 89.5, creative_generation: 72.1 },
    avg_prior: 76.90,
    cost_per_1k_tokens_usd: 0.002,
    avg_latency_ms: 1600,
    provider: "sarvam",
    specialization: "indic_languages",
  },
  {
    model_id: "deepseek-ai/DeepSeek-V3",
    short_name: "DeepSeek V3",
    parameters_b: 671,
    hardware_tier: "high",
    prior_scores: { reasoning: 86.3, structured_output: 83.9, language_fidelity: 76.8, creative_generation: 81.2 },
    avg_prior: 82.05,
    cost_per_1k_tokens_usd: 0.002,
    avg_latency_ms: 3500,
    provider: "deepseek",
  },
  {
    model_id: "deepseek-ai/DeepSeek-R1",
    short_name: "DeepSeek R1",
    parameters_b: 671,
    hardware_tier: "high",
    prior_scores: { reasoning: 91.2, structured_output: 79.4, language_fidelity: 73.1, creative_generation: 76.8 },
    avg_prior: 80.13,
    cost_per_1k_tokens_usd: 0.005,
    avg_latency_ms: 8000,
    provider: "deepseek",
    specialization: "reasoning",
  },
  {
    model_id: "microsoft/phi-4",
    short_name: "Phi-4 14B",
    parameters_b: 14,
    hardware_tier: "mid",
    prior_scores: { reasoning: 76.8, structured_output: 78.5, language_fidelity: 66.2, creative_generation: 72.4 },
    avg_prior: 73.48,
    cost_per_1k_tokens_usd: 0.001,
    avg_latency_ms: 1100,
    provider: "together",
  },
  {
    model_id: "meta-llama/Llama-3.3-70B-Instruct",
    short_name: "Llama 3.3 70B",
    parameters_b: 70,
    hardware_tier: "high",
    prior_scores: { reasoning: 84.8, structured_output: 82.1, language_fidelity: 74.5, creative_generation: 81.3 },
    avg_prior: 80.68,
    cost_per_1k_tokens_usd: 0.0035,
    avg_latency_ms: 2700,
    provider: "together",
  },
  {
    model_id: "sarvamai/sarvam-2b",
    short_name: "Sarvam 2B",
    parameters_b: 2,
    hardware_tier: "low",
    prior_scores: { reasoning: 52.3, structured_output: 58.1, language_fidelity: 82.4, creative_generation: 55.8 },
    avg_prior: 62.15,
    cost_per_1k_tokens_usd: 0.0004,
    avg_latency_ms: 400,
    provider: "sarvam",
    specialization: "indic_languages",
  },
];

// ---------------------------------------------------------------------------
// Sigma table (Motorola Six Sigma DPMO-to-Sigma)
// ---------------------------------------------------------------------------

const SIGMA_TO_DPMO: [number, number][] = [
  [6.0, 3.4],
  [5.5, 32],
  [5.0, 233],
  [4.5, 1350],
  [4.0, 6210],
  [3.5, 22750],
  [3.0, 66807],
  [2.5, 158655],
  [2.0, 308538],
  [1.5, 500000],
  [1.0, 691462],
  [0.5, 841345],
  [0.0, 933193],
];

// DPMO_TO_SIGMA sorted ascending by dpmo for interpolation
const DPMO_TO_SIGMA: [number, number][] = SIGMA_TO_DPMO
  .map(([sigma, dpmo]) => [dpmo, sigma] as [number, number])
  .sort((a, b) => a[0] - b[0]);

function dpmoToSigma(dpmoValue: number): number {
  if (dpmoValue <= 3.4) return 6.0;
  if (dpmoValue >= 933193) return 0.0;

  for (let i = 0; i < DPMO_TO_SIGMA.length - 1; i++) {
    const [dpmoLow, sigmaHigh] = DPMO_TO_SIGMA[i];
    const [dpmoHigh, sigmaLow] = DPMO_TO_SIGMA[i + 1];
    if (dpmoLow <= dpmoValue && dpmoValue <= dpmoHigh) {
      const fraction = (dpmoValue - dpmoLow) / (dpmoHigh - dpmoLow);
      return sigmaHigh - fraction * (sigmaHigh - sigmaLow);
    }
  }
  return 0.0;
}

// ---------------------------------------------------------------------------
// Indic intent detection
// ---------------------------------------------------------------------------

const INDIC_KEYWORDS = [
  "hindi", "kirana", "tamil", "telugu", "bengali",
  "marathi", "gujarati", "kannada", "malayalam", "punjabi",
  "odia", "urdu", "indic", "devanagari", "bharat",
];

function isIndicIntent(intent: string): boolean {
  const lower = intent.toLowerCase();
  return INDIC_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Seeded PRNG — deterministic based on intent string
//
// Uses a simple mulberry32 algorithm seeded from a hash of the intent string.
// This ensures the same intent always produces the same simulated results.
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash);
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return a seeded random in [lo, hi) */
function seededRange(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** Box-Muller gaussian from a uniform PRNG */
function seededGaussian(rng: () => number, mu: number, sigma: number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return mu + z * sigma;
}

// ---------------------------------------------------------------------------
// Cpk verdict
// ---------------------------------------------------------------------------

function cpkVerdict(cpk: number): string {
  if (cpk >= 1.67) return "excellent";
  if (cpk >= 1.33) return "production_grade";
  if (cpk >= 1.0) return "marginal";
  if (cpk >= 0.67) return "poor";
  return "incapable";
}

// ---------------------------------------------------------------------------
// Pillar-aware prior score
// ---------------------------------------------------------------------------

const PILLAR_TO_KEY: Record<string, string> = {
  accuracy: "reasoning",
  reasoning: "reasoning",
  structure: "structured_output",
  structured_output: "structured_output",
  language: "language_fidelity",
  language_fidelity: "language_fidelity",
  safety: "creative_generation", // closest proxy
  creative: "creative_generation",
  creative_generation: "creative_generation",
};

function getPriorScore(model: ArchiveModel, pillar?: string | null): number {
  if (pillar) {
    const key = PILLAR_TO_KEY[pillar.toLowerCase()];
    if (key && key in model.prior_scores) {
      return model.prior_scores[key];
    }
  }
  return model.avg_prior;
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------

function simulateMeasure(req: MeasureRequest): MeasureResponse {
  const { intent, pillar, n_trials, lsl } = req;
  const indic = isIndicIntent(intent);

  // Seed PRNG from intent
  const seed = hashString(intent);
  const rng = mulberry32(seed);

  // Sort by pillar-relevant prior score, pick top 5
  const sorted = [...MODEL_ARCHIVE].sort(
    (a, b) => getPriorScore(b, pillar) - getPriorScore(a, pillar)
  );
  const candidates = sorted.slice(0, 5);

  // If indic intent, ensure at least one Sarvam model is included
  if (indic) {
    const hasSarvam = candidates.some((m) => m.provider === "sarvam");
    if (!hasSarvam) {
      const sarvam = MODEL_ARCHIVE.find((m) => m.model_id === "sarvamai/sarvam-m-24b");
      if (sarvam) {
        candidates.pop(); // replace the weakest
        candidates.push(sarvam);
      }
    }
    // Also add Sarvam 2B if not present for variety
    const hasSarvam2B = candidates.some((m) => m.model_id === "sarvamai/sarvam-2b");
    if (!hasSarvam2B) {
      const sarvam2b = MODEL_ARCHIVE.find((m) => m.model_id === "sarvamai/sarvam-2b");
      if (sarvam2b && candidates.length >= 2) {
        candidates[candidates.length - 1] = sarvam2b;
      }
    }
  }

  const modelResults: ModelResult[] = [];

  for (const model of candidates) {
    const prior = getPriorScore(model, pillar);
    const isIndicModel = model.specialization === "indic_languages";

    // Seeded distribution parameters
    const baseMu = prior + seededRange(rng, -3, 5);
    const baseSigma = Math.max(
      2.0,
      (100 - prior) * 0.15 + seededRange(rng, -1, 2)
    );

    // Indic boost: Indic-specialized models get +8 mu and 0.7x sigma on Indic intents
    let mu = baseMu;
    let sigma = baseSigma;
    if (indic && isIndicModel) {
      mu += 8;
      sigma *= 0.7;
    }

    // Generate trial scores
    const trialScores: number[] = [];
    for (let t = 0; t < n_trials; t++) {
      let score = seededGaussian(rng, mu, sigma);
      // Clamp to [0, 100]
      score = Math.max(0, Math.min(100, score));
      trialScores.push(Math.round(score * 100) / 100);
    }

    // Compute statistics from trial scores
    const n = trialScores.length;
    const trialMu = trialScores.reduce((a, b) => a + b, 0) / n;
    const variance =
      trialScores.reduce((a, s) => a + (s - trialMu) ** 2, 0) / Math.max(n - 1, 1);
    const trialSigma = Math.max(Math.sqrt(variance), 1e-9);

    // Cpk (one-sided, LSL only)
    const cpkValue = (trialMu - lsl) / (3 * trialSigma);

    // DPMO from defect count
    const defects = trialScores.filter((s) => s < lsl).length;
    const dpmoValue = (defects / n) * 1_000_000;

    // Sigma level via lookup interpolation
    const sigmaLevel = dpmoToSigma(dpmoValue);

    // Match score = 0.6 * mu + 0.4 * (100 - normalized_sigma)
    const normalizedSigma = Math.min((trialSigma / 25.0) * 100, 100);
    const matchScore = Math.min(
      Math.max(0.6 * trialMu + 0.4 * (100 - normalizedSigma), 0),
      100
    );

    // Verdict
    const verdict = cpkVerdict(cpkValue);

    // Simulated gauge R&R (12-22% is realistic for a 3-judge frontier panel)
    const gaugeRR = Math.round((12 + rng() * 10) * 100) / 100;

    // Cost: n_trials * avg tokens * cost_per_1k
    const avgTokens = 800 + rng() * 400;
    const costUsd = n_trials * (avgTokens / 1000) * model.cost_per_1k_tokens_usd;

    // Latency with some noise
    const latencyMs = model.avg_latency_ms * (0.85 + rng() * 0.3);

    modelResults.push({
      model_id: model.model_id,
      short_name: model.short_name,
      mu: Math.round(trialMu * 100) / 100,
      sigma: Math.round(trialSigma * 100) / 100,
      cpk: Math.round(cpkValue * 1000) / 1000,
      dpmo: Math.round(dpmoValue * 10) / 10,
      sigma_level: Math.round(sigmaLevel * 100) / 100,
      match_score: Math.round(matchScore * 100) / 100,
      verdict,
      gauge_rr_pct: gaugeRR,
      cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
      latency_ms: Math.round(latencyMs),
      trial_scores: trialScores,
      lsl,
      parameters_b: model.parameters_b,
      hardware_tier: model.hardware_tier,
    });
  }

  // Sort by match_score descending (best first)
  modelResults.sort((a, b) => b.match_score - a.match_score);

  const totalCost = modelResults.reduce((a, r) => a + r.cost_usd, 0);

  return {
    model_results: modelResults,
    wall_clock_seconds: Math.round((1.2 + rng() * 2.5) * 100) / 100,
    total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    trace_url: null,
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const intent: string = body.intent;
    const pillar: string | null = body.pillar ?? null;
    const n_trials: number = body.n_trials ?? 5;
    const lsl: number = body.lsl ?? 70.0;

    if (!intent || typeof intent !== "string" || intent.trim().length === 0) {
      return NextResponse.json(
        { detail: "intent is required and must be a non-empty string" },
        { status: 422 }
      );
    }

    if (n_trials < 1 || n_trials > 30) {
      return NextResponse.json(
        { detail: "n_trials must be between 1 and 30" },
        { status: 422 }
      );
    }

    if (lsl < 0 || lsl > 100) {
      return NextResponse.json(
        { detail: "lsl must be between 0 and 100" },
        { status: 422 }
      );
    }

    // Simulate pipeline delay (500-1000ms) to make the animation feel real
    const delay = 500 + Math.random() * 500;
    await new Promise((r) => setTimeout(r, delay));

    const result = simulateMeasure({ intent: intent.trim(), pillar, n_trials, lsl });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
