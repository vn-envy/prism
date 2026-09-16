'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPricingCatalog } from '../lib/pricing';
import type { PricingRow } from '../lib/supabase';

export default function CatalogPage() {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPricingCatalog().then((data) => {
      if (!cancelled) {
        setRows(data);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const avgIn =
    rows.length > 0
      ? rows.reduce((s, r) => s + Number(r.input_cost_per_1k_tokens), 0) /
        rows.length
      : 0;

  return (
    <main className="min-h-screen bg-panel">
      <header className="border-b border-panel-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-xs text-neutral-500 tracking-widest">
              PRISM · MODEL CATALOG
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
              Candidate model pricing
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="bevel bevel-focus px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-300 hover:text-neutral-100"
          >
            &lt; Back
          </Link>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 py-8">
        {loaded && rows.length === 0 && (
          <div className="panel p-8 text-center">
            <div className="label-engraved mb-2">No pricing data</div>
            <p className="text-neutral-400 text-sm leading-relaxed max-w-md mx-auto">
              The pricing catalog is not populated yet. Run a measurement to
              register models, then their list prices appear here.
            </p>
          </div>
        )}
        {loaded && rows.length > 0 && (
          <>
            <div className="panel px-5 py-4 mb-6 flex flex-wrap items-center gap-6">
              <div className="flex flex-col">
                <span className="label-engraved">Models indexed</span>
                <span className="readout text-3xl text-neutral-100">
                  {rows.length}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="label-engraved">Avg input cost</span>
                <span className="readout text-3xl text-neutral-100">
                  ${avgIn.toFixed(4)}/1K
                </span>
              </div>
              <div className="flex flex-col ml-auto">
                <span className="label-engraved">Cheapest model</span>
                <span className="readout text-sm text-neutral-100">
                  {
                    rows[0]?.short_name
                  }
                </span>
              </div>
            </div>

            <div className="panel overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="text-neutral-500 text-left border-b border-panel-border">
                    <th className="p-3 label-engraved">model</th>
                    <th className="p-3 label-engraved">provider</th>
                    <th className="p-3 label-engraved">hardware tier</th>
                    <th className="p-3 label-engraved text-right">input $/1K</th>
                    <th className="p-3 label-engraved text-right">output $/1K</th>
                    <th className="p-3 label-engraved text-right">params</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.model_id}
                      className="border-t border-panel-border text-neutral-200 hover:bg-panel-muted/40"
                    >
                      <td className="p-3 text-neutral-100">
                        {r.short_name}
                        <div className="text-neutral-600 text-[10px]">
                          {r.model_id}
                        </div>
                      </td>
                      <td className="p-3 text-neutral-400">{r.provider}</td>
                      <td className="p-3 text-neutral-400">
                        {r.hardware_tier || '—'}
                      </td>
                      <td className="p-3 text-right text-neutral-200">
                        ${Number(r.input_cost_per_1k_tokens).toFixed(4)}
                      </td>
                      <td className="p-3 text-right text-neutral-200">
                        ${Number(r.output_cost_per_1k_tokens).toFixed(4)}
                      </td>
                      <td className="p-3 text-right text-neutral-400">
                        {r.parameters_b ? `${r.parameters_b}B` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
