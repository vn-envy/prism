'use client';

import type { ModelResult } from '../lib/types';

/**
 * Shows a shareable launch checklist for the recommended model after
 * measurement completes.
 */
export default function LaunchChecklist({ model }: { model: ModelResult }) {
  const checks = [
    {
      label: 'Production-grade reliability',
      pass: model.cpk >= 1.0,
    },
    {
      label: 'Measurement validity',
      pass: model.gauge_rr_pct <= 30,
    },
    {
      label: 'Monthly cost projection',
      pass: true,
      value: `$${model.cost_usd.toFixed(4)}/run`,
    },
  ];

  const handleCopy = () => {
    const payload = {
      model_id: model.model_id,
      short_name: model.short_name,
      cpk: model.cpk,
      sigma_level: model.sigma_level,
      dpmo: model.dpmo,
      verdict: model.verdict,
      timestamp: new Date().toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };

  return (
    <div className="panel-inset p-4 mt-4">
      <div className="label-engraved mb-2">Launch checklist</div>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 font-mono text-[12px]">
            <span
              className={`inline-block h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 ${
                c.pass
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-red-500 text-red-400'
              }`}
            >
              {c.pass ? '✓' : '✗'}
            </span>
            <span className="text-neutral-300">
              {c.label}
              {c.value ? (
                <span className="text-neutral-600 ml-2">{c.value}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="bevel bevel-focus px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-100 hover:border-neutral-500"
        >
          Copy JSON
        </button>
        <span className="font-mono text-[10px] text-neutral-500">
          Shareable report payload
        </span>
      </div>
    </div>
  );
}
