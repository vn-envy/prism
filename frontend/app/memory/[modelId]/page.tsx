'use client';

import Link from 'next/link';
import { use, useMemo } from 'react';
import HistoricalChart, {
  HistoricalPoint,
  detectNelsonViolations,
} from '../../components/HistoricalChart';

interface PageProps {
  params: Promise<{ modelId: string }>;
}

/**
 * Memory Explorer — historical control chart data across all past runs for
 * a specific model. In production this queries the database; here we
 * generate deterministic simulated history from the modelId.
 */
export default function MemoryExplorerPage({ params }: PageProps) {
  const { modelId } = use(params);
  const modelName = decodeURIComponent(modelId);

  const { points, mu, sigma, lsl, cpkTrend } = useMemo(
    () => generateHistory(modelName),
    [modelName],
  );

  const violations = useMemo(
    () => detectNelsonViolations(points, mu, sigma),
    [points, mu, sigma],
  );

  const values = points.map((p) => p.value);
  const histMean = avg(values);
  const histStd = stddev(values);
  const cpkCurrent = cpk(histMean, histStd, lsl);
  const cpkFirst = cpkTrend[0];
  const cpkLast = cpkTrend[cpkTrend.length - 1];
  const cpkDelta = cpkLast - cpkFirst;

  return (
    <main className="min-h-screen bg-panel">
      {/* ---- Header ---- */}
      <header className="border-b border-panel-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-xs text-neutral-500 tracking-widest">
              MEMORY EXPLORER · PROCESS HISTORY
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100 font-mono">
              {modelName} — Process History
            </h1>
          </div>
          <Link
            href="/"
            className="bevel bevel-focus px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-300 hover:text-neutral-100"
          >
            ◂ Back to Dashboard
          </Link>
        </div>
      </header>

      {/* ---- Summary stats ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatBlock label="historical μ" value={histMean.toFixed(2)} />
          <StatBlock label="historical σ" value={histStd.toFixed(2)} />
          <StatBlock
            label="current Cpk"
            value={cpkCurrent.toFixed(2)}
            emphasis
          />
          <StatBlock
            label="Cpk trend"
            value={`${cpkDelta >= 0 ? '+' : ''}${cpkDelta.toFixed(2)}`}
            tone={cpkDelta >= 0 ? 'good' : 'bad'}
          />
          <StatBlock
            label="measurements"
            value={`${points.length}`}
          />
        </div>
      </section>

      {/* ---- Chart ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-6">
        <HistoricalChart
          points={points}
          mu={mu}
          sigma={sigma}
          lsl={lsl}
        />
      </section>

      {/* ---- Violations panel ---- */}
      {violations.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pt-4">
          <div className="panel border-sigma-1 px-4 py-3">
            <div className="label-engraved text-sigma-1 mb-2">
              Nelson&rsquo;s Rule violations — {violations.length}
            </div>
            <ul className="space-y-1">
              {violations.map((v, i) => {
                const p = points[v.runIndex];
                return (
                  <li
                    key={`v-${i}`}
                    className="font-mono text-xs text-neutral-300"
                  >
                    <span className="text-sigma-1">Rule {v.rule}</span>
                    {'  '}· run r{p.run} ({p.timestamp}) · {v.description}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ---- Recent measurements table ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-6 pb-12">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="label-engraved">Recent measurements</div>
            <div className="font-mono text-[10px] text-neutral-500">
              showing {Math.min(points.length, 10)} of {points.length}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-neutral-500 text-left">
                  <th className="py-1 pr-6 label-engraved">run</th>
                  <th className="py-1 pr-6 label-engraved">timestamp</th>
                  <th className="py-1 pr-6 label-engraved">X̄</th>
                  <th className="py-1 pr-6 label-engraved">z-score</th>
                  <th className="py-1 pr-6 label-engraved">Cpk (cum)</th>
                  <th className="py-1 pr-6 label-engraved">status</th>
                </tr>
              </thead>
              <tbody>
                {[...points]
                  .slice(-10)
                  .reverse()
                  .map((p, idx) => {
                    const pointIdx = points.indexOf(p);
                    const z = (p.value - mu) / (sigma || 1);
                    const flagged =
                      violations.some((v) => v.runIndex === pointIdx) ||
                      p.value < lsl;
                    return (
                      <tr
                        key={`row-${idx}`}
                        className="border-t border-panel-border text-neutral-200"
                      >
                        <td className="py-1.5 pr-6">r{p.run}</td>
                        <td className="py-1.5 pr-6 text-neutral-400">
                          {p.timestamp}
                        </td>
                        <td className="py-1.5 pr-6 tabular-nums">
                          {p.value.toFixed(2)}
                        </td>
                        <td
                          className={`py-1.5 pr-6 tabular-nums ${
                            Math.abs(z) > 2
                              ? 'text-sigma-2'
                              : 'text-neutral-400'
                          }`}
                        >
                          {z >= 0 ? '+' : ''}
                          {z.toFixed(2)}σ
                        </td>
                        <td className="py-1.5 pr-6 tabular-nums text-neutral-400">
                          {(cpkTrend[pointIdx] ?? cpkCurrent).toFixed(2)}
                        </td>
                        <td className="py-1.5 pr-6">
                          {flagged ? (
                            <span className="text-sigma-1">✗ OOC</span>
                          ) : (
                            <span className="text-sigma-4">✓ in-control</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 font-mono text-[10px] text-neutral-600 tracking-widest uppercase">
          Simulated historical data · production deployment queries
          persisted measurements
        </div>
      </section>
    </main>
  );
}

/* ----------------------------------------------------------- sub-views */

function StatBlock({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'good' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-sigma-4'
      : tone === 'bad'
        ? 'text-sigma-2'
        : emphasis
          ? 'text-neutral-100'
          : 'text-neutral-200';
  return (
    <div className="panel-inset p-3">
      <div className="label-engraved">{label}</div>
      <div className={`readout text-lg ${toneClass}`}>{value}</div>
    </div>
  );
}

/* ----------------------------------------------------------- simulation */

interface HistoryData {
  points: HistoricalPoint[];
  mu: number;
  sigma: number;
  lsl: number;
  cpkTrend: number[];
}

/**
 * Deterministic simulated history for a given model name.
 *   • 15 points
 *   • slight upward trend (process improvement)
 *   • exactly one out-of-control point (beyond ±3σ)
 *   • rolling Cpk trend
 */
function generateHistory(modelName: string): HistoryData {
  const seed = hashString(modelName);
  const rand = lcg(seed);

  // Baseline varies slightly per model so each page is distinct
  const baseMu = 78 + (seed % 8);
  const baseSigma = 3.2 + ((seed >> 3) % 10) / 10; // 3.2 – 4.1
  const lsl = 70;

  const n = 15;
  const points: HistoricalPoint[] = [];

  // Seeded timestamps — every ~4 hours going backward from "now"
  const msPerRun = 4 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 3, 18, 18, 0, 0); // stable reference

  for (let i = 0; i < n; i++) {
    // Slight upward trend: +0.12 per run on average
    const trend = i * 0.12;
    // Normal noise via Box-Muller
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    let v = baseMu + trend + baseSigma * 0.9 * z;

    // Inject exactly one OOC point at index 7 (below -3σ)
    if (i === 7) {
      v = baseMu - 3.6 * baseSigma;
    }

    v = Math.max(0, Math.min(100, v));
    const tsMs = now - (n - 1 - i) * msPerRun;
    points.push({
      run: i + 1,
      value: v,
      timestamp: formatTimestamp(tsMs),
    });
  }

  // Rolling Cpk computed over expanding window (min 3 points)
  const cpkTrend: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(0, i + 1).map((p) => p.value);
    if (window.length < 3) {
      cpkTrend.push(NaN);
      continue;
    }
    const m = avg(window);
    const s = stddev(window);
    cpkTrend.push(cpk(m, s, lsl));
  }
  // Fill initial NaNs with the first valid Cpk
  const firstValid = cpkTrend.find((c) => !Number.isNaN(c)) ?? 1.0;
  for (let i = 0; i < cpkTrend.length; i++) {
    if (Number.isNaN(cpkTrend[i])) cpkTrend[i] = firstValid;
  }

  return {
    points,
    mu: avg(points.map((p) => p.value)),
    sigma: stddev(points.map((p) => p.value)),
    lsl,
    cpkTrend,
  };
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h || 1;
}

function lcg(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function cpk(mu: number, sigma: number, lsl: number): number {
  if (sigma <= 0) return 0;
  return (mu - lsl) / (3 * sigma);
}
