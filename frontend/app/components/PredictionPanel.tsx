'use client';

import { useMemo } from 'react';
import type { ModelResult } from '../lib/types';

/**
 * Predicts cost and expected failures at different traffic levels for
 * the recommended model after measurement completes. Purely deterministic.
 */
export default function PredictionPanel({ model }: { model: ModelResult }) {
  const scenarios = useMemo(() => [1000, 10_000, 100_000, 1_000_000], []);

  const rows = useMemo(
    () =>
      scenarios.map((calls) => {
        const failures = (model.dpmo / 1_000_000) * calls;
        return { calls, failures };
      }),
    [scenarios, model.dpmo],
  );

  return (
    <div className="panel-inset p-4 mb-4">
      <div className="label-engraved mb-2">Prediction: expected failures</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {rows.map((row) => (
          <div
            key={row.calls}
            className="panel-inset p-3"
          >
            <div className="label-engraved">
              {formatCalls(row.calls)} calls
            </div>
            <div className="readout text-lg text-neutral-100">
              {row.failures < 1 && row.failures > 0
                ? '<1'
                : Math.round(row.failures).toLocaleString()}{' '}
              failures
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 font-mono text-[10px] text-neutral-500">
        Current observed DPMO: {Math.round(model.dpmo).toLocaleString()}
      </div>
    </div>
  );
}

function formatCalls(calls: number): string {
  if (calls >= 1_000_000) return '1M';
  if (calls >= 1000) return `${(calls / 1000).toFixed(0)}K`;
  return `${calls}`;
}
