'use client';

interface ControlChartProps {
  mu: number;
  sigma: number;
  lsl: number;
  /**
   * Optional observed trial scores. If omitted, we synthesize a plausible
   * set of points at μ ± jittered σ so the chart renders meaningfully even
   * when the backend response does not include raw trial data.
   */
  trialScores?: number[];
  nTrials?: number;
}

/**
 * Shewhart X̄ (X-bar) control chart — pure SVG, no dependencies.
 *
 *   • Horizontal centerline at μ
 *   • Upper / Lower control limits at μ ± 3σ (dashed)
 *   • Lower Specification Limit drawn in red
 *   • Data points plotted per trial, connected with a thin line
 */
export default function ControlChart({
  mu,
  sigma,
  lsl,
  trialScores,
  nTrials = 5,
}: ControlChartProps) {
  const scores = trialScores && trialScores.length > 0
    ? trialScores
    : synthesizeScores(mu, sigma, nTrials);

  // Y axis bounds: include μ±3σ, LSL, and observed range with padding.
  const ucl = mu + 3 * sigma;
  const lcl = mu - 3 * sigma;
  const yMin = Math.min(lcl, lsl, ...scores) - 2;
  const yMax = Math.max(ucl, 100, ...scores) + 2;

  // SVG viewport
  const W = 560;
  const H = 220;
  const PAD_L = 48;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const xFor = (i: number) =>
    PAD_L + (scores.length === 1 ? plotW / 2 : (i * plotW) / (scores.length - 1));
  const yFor = (v: number) =>
    PAD_T + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const pathD = scores
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(s)}`)
    .join(' ');

  // Axis ticks — a few reference levels
  const yTicks = [yMin, lsl, mu, ucl, yMax].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  return (
    <div className="panel-inset p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="label-engraved">Shewhart X̄ Control Chart</div>
        <div className="font-mono text-[10px] text-neutral-500">
          n={scores.length}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Shewhart X-bar control chart"
      >
        {/* Plot area background */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={plotW}
          height={plotH}
          fill="#0a0a0a"
          stroke="#262626"
        />

        {/* Gridlines at y ticks */}
        {yTicks.map((v, idx) => (
          <line
            key={`grid-${idx}`}
            x1={PAD_L}
            x2={PAD_L + plotW}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="#1f1f1f"
            strokeWidth={1}
          />
        ))}

        {/* Upper & Lower Control Limits — dashed neutral */}
        <line
          x1={PAD_L}
          x2={PAD_L + plotW}
          y1={yFor(ucl)}
          y2={yFor(ucl)}
          stroke="#6b7280"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        <line
          x1={PAD_L}
          x2={PAD_L + plotW}
          y1={yFor(lcl)}
          y2={yFor(lcl)}
          stroke="#6b7280"
          strokeWidth={1}
          strokeDasharray="4 3"
        />

        {/* Mean line */}
        <line
          x1={PAD_L}
          x2={PAD_L + plotW}
          y1={yFor(mu)}
          y2={yFor(mu)}
          stroke="#9ca3af"
          strokeWidth={1}
        />

        {/* LSL — red, solid */}
        <line
          x1={PAD_L}
          x2={PAD_L + plotW}
          y1={yFor(lsl)}
          y2={yFor(lsl)}
          stroke="#ef4444"
          strokeWidth={1.25}
        />

        {/* Data path */}
        <path
          d={pathD}
          fill="none"
          stroke="#e5e5e5"
          strokeWidth={1.25}
        />

        {/* Data points */}
        {scores.map((s, i) => {
          const belowLsl = s < lsl;
          return (
            <circle
              key={`pt-${i}`}
              cx={xFor(i)}
              cy={yFor(s)}
              r={3}
              fill={belowLsl ? '#ef4444' : '#e5e5e5'}
              stroke="#0a0a0a"
              strokeWidth={1}
            />
          );
        })}

        {/* Y axis labels (μ, UCL, LCL, LSL) */}
        <text
          x={PAD_L - 6}
          y={yFor(mu) + 3}
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fontSize="9"
          fill="#9ca3af"
        >
          μ={mu.toFixed(1)}
        </text>
        <text
          x={PAD_L - 6}
          y={yFor(ucl) + 3}
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fontSize="9"
          fill="#6b7280"
        >
          +3σ
        </text>
        <text
          x={PAD_L - 6}
          y={yFor(lcl) + 3}
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fontSize="9"
          fill="#6b7280"
        >
          −3σ
        </text>
        <text
          x={PAD_L - 6}
          y={yFor(lsl) + 3}
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fontSize="9"
          fill="#ef4444"
        >
          LSL={lsl.toFixed(0)}
        </text>

        {/* X axis trial labels */}
        {scores.map((_, i) => (
          <text
            key={`xt-${i}`}
            x={xFor(i)}
            y={H - 10}
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="9"
            fill="#6b7280"
          >
            t{i + 1}
          </text>
        ))}
      </svg>

      {trialScores === undefined && (
        <div className="mt-2 text-[10px] text-neutral-600 font-mono">
          * points reconstructed from μ,σ — exact per-trial scores not returned by API
        </div>
      )}
    </div>
  );
}

/**
 * Deterministic pseudo-random points around μ ± σ. Used when the backend
 * does not return raw trial data — gives the chart an honest shape without
 * fabricating misleading data (a note is displayed in the UI).
 */
function synthesizeScores(mu: number, sigma: number, n: number): number[] {
  const out: number[] = [];
  // Simple LCG seeded from mu+sigma for determinism
  let seed = Math.floor((mu * 1000 + sigma * 100) % 2147483647) || 1;
  const rand = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    // Box-Muller for a normal-ish draw, then clamp to [0,100]
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = Math.max(0, Math.min(100, mu + sigma * z));
    out.push(v);
  }
  return out;
}
