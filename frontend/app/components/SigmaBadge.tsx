import { cpkTier, tierHex, tierLabel } from '../lib/types';

interface SigmaBadgeProps {
  sigmaLevel: number;
  cpk: number;
  dpmo: number;
}

/**
 * Readout plate showing the Six-Sigma level, DPMO, and a textual verdict.
 * Styled like an engraved instrument plate — no gradients, no shadows.
 */
export default function SigmaBadge({ sigmaLevel, cpk, dpmo }: SigmaBadgeProps) {
  const tier = cpkTier(cpk);
  const color = tierHex(tier);

  return (
    <div
      className="panel-inset px-3 py-2 flex flex-col"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="label-engraved">σ-Level</span>
        <span
          className="readout text-2xl font-semibold"
          style={{ color }}
        >
          {sigmaLevel.toFixed(1)}σ
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="label-engraved">DPMO</span>
        <span className="readout text-xs text-neutral-400">
          {formatDpmo(dpmo)}
        </span>
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-neutral-500">
        {tierLabel(tier)}
      </div>
    </div>
  );
}

function formatDpmo(dpmo: number): string {
  if (!isFinite(dpmo)) return '∞';
  if (dpmo >= 1_000_000) return '≥1M';
  if (dpmo >= 10_000) return `${Math.round(dpmo).toLocaleString()}`;
  if (dpmo >= 100) return `${Math.round(dpmo).toLocaleString()}`;
  return dpmo.toFixed(1);
}
