// Mirrors app/models.py on the FastAPI backend.

export interface ModelResult {
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
  trial_scores?: number[] | null;
  lsl?: number | null;
  parameters_b?: number | null;
  hardware_tier?: string | null;
}

export interface MeasureResponse {
  model_results: ModelResult[];
  wall_clock_seconds: number;
  total_cost_usd: number;
  trace_url: string | null;
}

export interface MeasureRequest {
  intent: string;
  pillar?: string | null;
  n_trials: number;
  lsl: number;
}

/**
 * Map a Cpk value to the sigma-color tier and an associated Tailwind class.
 *   ≥ 1.67 → sigma-6 (dark green)
 *   ≥ 1.33 → sigma-4 (green)
 *   ≥ 1.00 → sigma-3 (yellow)
 *   ≥ 0.67 → sigma-2 (orange)
 *   <  0.67 → sigma-1 (red)
 */
export type SigmaTier = 6 | 4 | 3 | 2 | 1;

export function cpkTier(cpk: number): SigmaTier {
  if (cpk >= 1.67) return 6;
  if (cpk >= 1.33) return 4;
  if (cpk >= 1.0) return 3;
  if (cpk >= 0.67) return 2;
  return 1;
}

export function tierTextClass(tier: SigmaTier): string {
  switch (tier) {
    case 6:
      return 'text-sigma-6';
    case 4:
      return 'text-sigma-4';
    case 3:
      return 'text-sigma-3';
    case 2:
      return 'text-sigma-2';
    case 1:
      return 'text-sigma-1';
  }
}

export function tierBgClass(tier: SigmaTier): string {
  switch (tier) {
    case 6:
      return 'bg-sigma-6';
    case 4:
      return 'bg-sigma-4';
    case 3:
      return 'bg-sigma-3';
    case 2:
      return 'bg-sigma-2';
    case 1:
      return 'bg-sigma-1';
  }
}

export function tierHex(tier: SigmaTier): string {
  switch (tier) {
    case 6:
      return '#15803d';
    case 4:
      return '#22c55e';
    case 3:
      return '#eab308';
    case 2:
      return '#f97316';
    case 1:
      return '#ef4444';
  }
}

export function tierLabel(tier: SigmaTier): string {
  switch (tier) {
    case 6:
      return 'World-class';
    case 4:
      return 'Capable';
    case 3:
      return 'Marginal';
    case 2:
      return 'Not capable';
    case 1:
      return 'Incapable';
  }
}
