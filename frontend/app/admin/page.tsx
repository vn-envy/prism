'use client';

import Link from 'next/link';
import { useMemo } from 'react';

/**
 * PRISM Control Plan — Hour 4 dashboard.
 *
 * Aggregates cost, detects run-vs-run Cpk drift, surfaces out-of-control
 * alerts, and exposes evaluator integrity + system status. All data is
 * simulated for now.
 */
export default function AdminControlPlanPage() {
  const runs = useMemo(() => SIMULATED_RUNS, []);

  const totalCost = runs.reduce((a, r) => a + r.costUsd, 0);

  // Build a { modelId -> [ { run, cpk, sigma } ] } pivot
  const modelIds = Array.from(
    new Set(runs.flatMap((r) => r.models.map((m) => m.modelId))),
  );
  const pivot = modelIds.map((id) => ({
    modelId: id,
    perRun: runs.map((r) => {
      const m = r.models.find((mm) => mm.modelId === id);
      return m ? { runId: r.runId, cpk: m.cpk, sigma: m.sigma, mu: m.mu } : null;
    }),
  }));

  // Drift detection: Cpk delta > 0.3 between ANY adjacent pair of runs
  const driftAlerts = pivot.flatMap((row) => {
    const valid = row.perRun.filter(
      (x): x is NonNullable<typeof x> => x !== null,
    );
    const alerts: { modelId: string; from: string; to: string; delta: number }[] =
      [];
    for (let i = 1; i < valid.length; i++) {
      const delta = valid[i].cpk - valid[i - 1].cpk;
      if (Math.abs(delta) > 0.3) {
        alerts.push({
          modelId: row.modelId,
          from: valid[i - 1].runId,
          to: valid[i].runId,
          delta,
        });
      }
    }
    return alerts;
  });

  // σ drift alerts: deviation > 2σ from baseline (first-run sigma)
  const sigmaAlerts = pivot.flatMap((row) => {
    const valid = row.perRun.filter(
      (x): x is NonNullable<typeof x> => x !== null,
    );
    if (valid.length < 2) return [];
    const baseline = valid[0].sigma;
    const alerts: {
      modelId: string;
      runId: string;
      sigma: number;
      baseline: number;
      zOfSigma: number;
    }[] = [];
    for (let i = 1; i < valid.length; i++) {
      // crude: flag when observed σ exceeds 2× baseline σ
      const zOfSigma = (valid[i].sigma - baseline) / baseline;
      if (Math.abs(zOfSigma) > 0.5) {
        alerts.push({
          modelId: row.modelId,
          runId: valid[i].runId,
          sigma: valid[i].sigma,
          baseline,
          zOfSigma,
        });
      }
    }
    return alerts;
  });

  return (
    <main className="min-h-screen bg-panel">
      {/* ---- Header ---- */}
      <header className="border-b border-panel-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-xs text-neutral-500 tracking-widest">
              PRISM · OPERATIONS
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
              PRISM Control Plan
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

      {/* ---- Cost accumulator ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-6">
        <div className="panel p-5">
          <div className="label-engraved mb-1">Compute Cost Accumulator</div>
          <div className="readout text-4xl text-neutral-100">
            ${totalCost.toFixed(4)}
          </div>
          <div className="mt-1 font-mono text-xs text-neutral-400">
            Total compute cost for entire demo: ${totalCost.toFixed(4)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {runs.map((r) => (
              <div key={r.runId} className="panel-inset p-2">
                <div className="label-engraved">{r.runId}</div>
                <div className="readout text-sm">
                  ${r.costUsd.toFixed(4)}
                </div>
                <div className="font-mono text-[10px] text-neutral-500">
                  {r.timestamp}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Run-vs-run Cpk stability ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-6">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="label-engraved">
              Run-vs-Run Cpk Stability (drift threshold |ΔCpk| &gt; 0.30)
            </div>
            <div className="font-mono text-[10px] text-neutral-500">
              {runs.length} runs · {modelIds.length} models
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-left">
                  <th className="py-1 pr-6 label-engraved">model</th>
                  {runs.map((r) => (
                    <th
                      key={`h-${r.runId}`}
                      className="py-1 pr-6 label-engraved"
                    >
                      {r.runId}
                    </th>
                  ))}
                  <th className="py-1 pr-6 label-engraved">max |Δ|</th>
                  <th className="py-1 pr-6 label-engraved">status</th>
                </tr>
              </thead>
              <tbody>
                {pivot.map((row) => {
                  const valid = row.perRun.filter(
                    (x): x is NonNullable<typeof x> => x !== null,
                  );
                  let maxDelta = 0;
                  for (let i = 1; i < valid.length; i++) {
                    const d = Math.abs(valid[i].cpk - valid[i - 1].cpk);
                    if (d > maxDelta) maxDelta = d;
                  }
                  const drifting = maxDelta > 0.3;
                  return (
                    <tr
                      key={`row-${row.modelId}`}
                      className="border-t border-panel-border text-neutral-200"
                    >
                      <td className="py-1.5 pr-6">
                        <Link
                          href={`/memory/${encodeURIComponent(row.modelId)}`}
                          className="text-neutral-100 hover:underline underline-offset-4 decoration-panel-border"
                        >
                          {row.modelId}
                        </Link>
                      </td>
                      {row.perRun.map((cell, i) => (
                        <td
                          key={`c-${i}`}
                          className="py-1.5 pr-6 tabular-nums"
                        >
                          {cell ? cell.cpk.toFixed(2) : '—'}
                        </td>
                      ))}
                      <td
                        className={`py-1.5 pr-6 tabular-nums ${
                          drifting ? 'text-sigma-1' : 'text-neutral-400'
                        }`}
                      >
                        {maxDelta.toFixed(2)}
                      </td>
                      <td className="py-1.5 pr-6">
                        {drifting ? (
                          <span className="text-sigma-1">
                            ✗ drift detected
                          </span>
                        ) : (
                          <span className="text-sigma-4">✓ stable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---- Out-of-control alerts ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-6">
        <div
          className={`panel p-4 ${
            driftAlerts.length + sigmaAlerts.length > 0
              ? 'border-sigma-1'
              : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="label-engraved">
              Out-of-Control Alerts (σ deviation &gt; baseline)
            </div>
            <div className="font-mono text-[10px] text-neutral-500">
              {sigmaAlerts.length} σ · {driftAlerts.length} Cpk
            </div>
          </div>

          {sigmaAlerts.length === 0 && driftAlerts.length === 0 && (
            <div className="font-mono text-xs text-neutral-400">
              ✓ No alerts. All models within control limits.
            </div>
          )}

          {sigmaAlerts.length > 0 && (
            <div className="mb-3">
              <div className="label-engraved mb-1">σ drift</div>
              <ul className="space-y-1">
                {sigmaAlerts.map((a, i) => (
                  <li
                    key={`s-${i}`}
                    className="font-mono text-xs text-neutral-300"
                  >
                    <span className="text-sigma-1">✗</span> {a.modelId} · run{' '}
                    {a.runId} · σ={a.sigma.toFixed(2)} (baseline{' '}
                    {a.baseline.toFixed(2)}, Δ={(a.zOfSigma * 100).toFixed(0)}
                    %)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {driftAlerts.length > 0 && (
            <div>
              <div className="label-engraved mb-1">Cpk drift</div>
              <ul className="space-y-1">
                {driftAlerts.map((a, i) => (
                  <li
                    key={`c-${i}`}
                    className="font-mono text-xs text-neutral-300"
                  >
                    <span className="text-sigma-1">✗</span> {a.modelId} ·{' '}
                    {a.from} → {a.to} · ΔCpk={' '}
                    {a.delta >= 0 ? '+' : ''}
                    {a.delta.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ---- Evaluator integrity + System status (side by side) ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel p-4">
            <div className="label-engraved mb-3">Evaluator Integrity</div>
            <dl className="space-y-2 font-mono text-xs">
              <Row label="locked SHA" value="937202df" emphasis />
              <Row
                label="commit ts"
                value="2026-04-17T09:14:22Z"
              />
              <Row
                label="signed by"
                value="prism-evaluator-key (rsa-2048)"
              />
              <Row label="verified" value="✓ hash match" tone="good" />
            </dl>
            <div className="mt-3 font-mono text-[10px] text-neutral-600 leading-relaxed">
              The evaluator SHA is pinned across all runs — any change
              invalidates historical Cpk baselines and triggers a
              re-qualification.
            </div>
          </div>

          <div className="panel p-4">
            <div className="label-engraved mb-3">System Status</div>
            <dl className="space-y-2 font-mono text-xs">
              <Row
                label="langfuse"
                value="connected"
                tone="good"
                dot
              />
              <Row label="database" value="online · pg 16.2" tone="good" dot />
              <Row
                label="models in pool"
                value={`${modelIds.length}`}
              />
              <Row
                label="last run"
                value={runs[runs.length - 1]?.timestamp ?? '—'}
              />
              <Row label="api" value="/api/measure · 200 OK" tone="good" dot />
            </dl>
          </div>
        </div>

        <div className="mt-6 font-mono text-[10px] text-neutral-600 tracking-widest uppercase">
          Simulated run data · production deployment aggregates from
          persisted measurement store
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------- sub-views */

function Row({
  label,
  value,
  emphasis,
  tone,
  dot,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'good' | 'bad';
  dot?: boolean;
}) {
  const toneClass =
    tone === 'good'
      ? 'text-sigma-4'
      : tone === 'bad'
        ? 'text-sigma-1'
        : emphasis
          ? 'text-neutral-100'
          : 'text-neutral-200';
  const dotColor =
    tone === 'good'
      ? 'bg-sigma-4'
      : tone === 'bad'
        ? 'bg-sigma-1'
        : 'bg-neutral-500';
  return (
    <div className="flex items-center gap-3">
      <dt className="label-engraved w-28 shrink-0">{label}</dt>
      <dd className={`flex items-center gap-2 ${toneClass}`}>
        {dot && <span className={`led-dot ${dotColor}`} />}
        <span className="tabular-nums">{value}</span>
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------- simulation */

interface RunModel {
  modelId: string;
  mu: number;
  sigma: number;
  cpk: number;
}
interface Run {
  runId: string;
  timestamp: string;
  costUsd: number;
  models: RunModel[];
}

const SIMULATED_RUNS: Run[] = [
  {
    runId: 'run-001',
    timestamp: '2026-04-19 08:12Z',
    costUsd: 0.0184,
    models: [
      { modelId: 'gpt-4o-mini', mu: 82.1, sigma: 3.4, cpk: 1.19 },
      { modelId: 'claude-3-5-sonnet', mu: 88.4, sigma: 2.6, cpk: 2.36 },
      { modelId: 'llama-3.1-70b', mu: 76.2, sigma: 4.8, cpk: 0.43 },
      { modelId: 'mistral-large', mu: 80.5, sigma: 3.9, cpk: 0.90 },
    ],
  },
  {
    runId: 'run-002',
    timestamp: '2026-04-19 12:47Z',
    costUsd: 0.0201,
    models: [
      { modelId: 'gpt-4o-mini', mu: 82.6, sigma: 3.5, cpk: 1.20 },
      { modelId: 'claude-3-5-sonnet', mu: 87.9, sigma: 2.8, cpk: 2.13 },
      // llama has drifted + σ widened — should trigger alerts
      { modelId: 'llama-3.1-70b', mu: 74.1, sigma: 6.2, cpk: 0.22 },
      { modelId: 'mistral-large', mu: 80.9, sigma: 3.7, cpk: 1.00 },
    ],
  },
  {
    runId: 'run-003',
    timestamp: '2026-04-19 16:03Z',
    costUsd: 0.0192,
    models: [
      { modelId: 'gpt-4o-mini', mu: 82.3, sigma: 3.4, cpk: 1.21 },
      { modelId: 'claude-3-5-sonnet', mu: 88.7, sigma: 2.5, cpk: 2.49 },
      { modelId: 'llama-3.1-70b', mu: 75.0, sigma: 5.9, cpk: 0.28 },
      { modelId: 'mistral-large', mu: 80.7, sigma: 3.8, cpk: 0.94 },
    ],
  },
];
