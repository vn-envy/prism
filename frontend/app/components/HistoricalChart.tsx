'use client';

import { useState } from 'react';

export interface HistoricalPoint {
  /** Sequential run index (1-based). */
  run: number;
  /** Observed X̄ for the run. */
  value: number;
  /** Timestamp label for the x-axis (e.g. "04-14 09:12"). */
  timestamp: string;
}

export interface NelsonViolation {
  runIndex: number; // 0-based index into points
  rule: 1 | 2;
  description: string;
}

interface HistoricalChartProps {
  points: HistoricalPoint[];
  mu: number;
  sigma: number;
  lsl: number;
  title?: string;
}

/**
 * Wide Shewhart X̄ chart for the Memory Explorer.
 *
 *   • Supports 15-20 points
 *   • Flags Nelson's Rule 1 violations (point beyond ±3σ) in red
 *   • Also flags Rule 2 (8 consecutive points on same side of μ)
 *   • X-axis labels are run numbers; timestamps shown in tooltip on hover
 *   • 800px wide SVG viewport
 */
export default function HistoricalChart({
  points,
  mu,
  sigma,
  lsl,
  title = 'Process History — Shewhart X̄ Chart',
}: HistoricalChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const ucl = mu + 3 * sigma;
  const lcl = mu - 3 * sigma;
  const values = points.map((p) => p.value);
  const yMin = Math.min(lcl, lsl, ...values) - 2;
  const yMax = Math.max(ucl, 100, ...values) + 2;

  // SVG viewport — wide for historical view
  const W = 800;
  const H = 280;
  const PAD_L = 56;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 36;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const xFor = (i: number) =>
    PAD_L +
    (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const yFor = (v: number) =>
    PAD_T + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`)
    .join(' ');

  // ---- Nelson's Rules -----------------------------------------------------
  const violations = detectNelsonViolations(points, mu, sigma);
  const violationByIdx = new Map<number, NelsonViolation[]>();
  for (const v of violations) {
    const list = violationByIdx.get(v.runIndex) ?? [];
    list.push(v);
    violationByIdx.set(v.runIndex, list);
  }

  // Show at most 10 x-labels so they don't collide
  const xLabelStride = Math.max(1, Math.ceil(points.length / 10));

  return (
    <div className="panel-inset p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="label-engraved">{title}</div>
        <div className="font-mono text-[10px] text-neutral-500">
          n={points.length} · violations={violations.length}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Historical Shewhart X-bar control chart"
      >
        <rect
          x={PAD_L}
          y={PAD_T}
          width={plotW}
          height={plotH}
          fill="#0a0a0a"
          stroke="#262626"
        />

        {/* Gridlines */}
        {[yMin, lsl, lcl, mu, ucl, yMax]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((v, idx) => (
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

        {/* UCL / LCL dashed */}
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

        {/* LSL */}
        <line
          x1={PAD_L}
          x2={PAD_L + plotW}
          y1={yFor(lsl)}
          y2={yFor(lsl)}
          stroke="#ef4444"
          strokeWidth={1.25}
        />

        {/* Data path */}
        <path d={pathD} fill="none" stroke="#e5e5e5" strokeWidth={1.25} />

        {/* Data points + hover hit areas */}
        {points.map((p, i) => {
          const isViolation = violationByIdx.has(i);
          const belowLsl = p.value < lsl;
          const flagged = isViolation || belowLsl;
          return (
            <g key={`pt-${i}`}>
              <circle
                cx={xFor(i)}
                cy={yFor(p.value)}
                r={flagged ? 4 : 3}
                fill={flagged ? '#ef4444' : '#e5e5e5'}
                stroke="#0a0a0a"
                strokeWidth={1}
              />
              {/* Larger invisible hit-circle for hover */}
              <circle
                cx={xFor(i)}
                cy={yFor(p.value)}
                r={10}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: 'pointer' }}
              />
            </g>
          );
        })}

        {/* Y-axis labels */}
        <text
          x={PAD_L - 6}
          y={yFor(mu) + 3}
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fontSize="10"
          fill="#9ca3af"
        >
          μ={mu.toFixed(1)}
        </text>
        <text
          x={PAD_L - 6}
          y={yFor(ucl) + 3}
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fontSize="10"
          fill="#6b7280"
        >
          +3σ
        </text>
        <text
          x={PAD_L - 6}
          y={yFor(lcl) + 3}
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fontSize="10"
          fill="#6b7280"
        >
          −3σ
        </text>
        <text
          x={PAD_L - 6}
          y={yFor(lsl) + 3}
          textAnchor="end"
          fontFamily="JetBrains Mono, monospace"
          fontSize="10"
          fill="#ef4444"
        >
          LSL={lsl.toFixed(0)}
        </text>

        {/* X-axis run labels */}
        {points.map((p, i) =>
          i % xLabelStride === 0 || i === points.length - 1 ? (
            <text
              key={`xt-${i}`}
              x={xFor(i)}
              y={H - 16}
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
              fontSize="9"
              fill="#6b7280"
            >
              r{p.run}
            </text>
          ) : null,
        )}
        <text
          x={PAD_L + plotW / 2}
          y={H - 2}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="9"
          fill="#4b5563"
        >
          run number (chronological)
        </text>

        {/* Tooltip */}
        {hoverIdx !== null && (() => {
          const p = points[hoverIdx];
          const vs = violationByIdx.get(hoverIdx) ?? [];
          const tx = xFor(hoverIdx);
          const ty = yFor(p.value);
          const boxW = 170;
          const boxH = 58 + vs.length * 12;
          // Keep tooltip in-plot
          const bx = Math.min(
            Math.max(tx + 10, PAD_L),
            PAD_L + plotW - boxW,
          );
          const by = Math.max(ty - boxH - 8, PAD_T + 4);
          return (
            <g pointerEvents="none">
              <rect
                x={bx}
                y={by}
                width={boxW}
                height={boxH}
                fill="#141414"
                stroke="#3a3a3a"
                strokeWidth={1}
              />
              <text
                x={bx + 8}
                y={by + 14}
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
                fill="#e5e5e5"
              >
                run {p.run} · {p.timestamp}
              </text>
              <text
                x={bx + 8}
                y={by + 28}
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
                fill="#9ca3af"
              >
                X̄ = {p.value.toFixed(2)}
              </text>
              <text
                x={bx + 8}
                y={by + 42}
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
                fill="#9ca3af"
              >
                z = {((p.value - mu) / (sigma || 1)).toFixed(2)}σ
              </text>
              {vs.map((v, idx) => (
                <text
                  key={`tv-${idx}`}
                  x={bx + 8}
                  y={by + 54 + idx * 12}
                  fontFamily="JetBrains Mono, monospace"
                  fontSize="9"
                  fill="#ef4444"
                >
                  ✗ Nelson #{v.rule}: {v.description}
                </text>
              ))}
            </g>
          );
        })()}
      </svg>

      <div className="mt-2 font-mono text-[10px] text-neutral-600">
        Red points violate Nelson&rsquo;s Rules (hover for detail). Dashed lines
        are ±3σ control limits; solid red line is LSL.
      </div>
    </div>
  );
}

/**
 * Detect Nelson's Rule 1 & 2 violations.
 *   Rule 1: any single point beyond ±3σ from μ
 *   Rule 2: 8 consecutive points on the same side of μ
 *           (flags the 8th and each subsequent point in the run)
 */
export function detectNelsonViolations(
  points: HistoricalPoint[],
  mu: number,
  sigma: number,
): NelsonViolation[] {
  const out: NelsonViolation[] = [];
  const ucl = mu + 3 * sigma;
  const lcl = mu - 3 * sigma;

  // Rule 1
  points.forEach((p, i) => {
    if (p.value > ucl || p.value < lcl) {
      out.push({
        runIndex: i,
        rule: 1,
        description: `point beyond ±3σ (${p.value.toFixed(2)})`,
      });
    }
  });

  // Rule 2 — 8-run on same side
  let streakSign = 0;
  let streakLen = 0;
  points.forEach((p, i) => {
    const sign = p.value > mu ? 1 : p.value < mu ? -1 : 0;
    if (sign === 0) {
      streakSign = 0;
      streakLen = 0;
      return;
    }
    if (sign === streakSign) {
      streakLen += 1;
    } else {
      streakSign = sign;
      streakLen = 1;
    }
    if (streakLen >= 8) {
      out.push({
        runIndex: i,
        rule: 2,
        description: `8+ consecutive ${sign > 0 ? 'above' : 'below'} μ`,
      });
    }
  });

  return out;
}
