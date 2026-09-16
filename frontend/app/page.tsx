'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const METRICS = [
  { big: 'Cpk', label: 'Process Capability Index', desc: 'The guarantee.' },
  { big: 'DPMO', label: 'Defects Per Million', desc: 'The cost of failure.' },
  { big: 'σ-level', label: 'Sigma Level', desc: 'The statistical grade.' },
];

export default function LandingPage() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setStep((s) => s + 1), 900);
    return () => clearTimeout(t);
  }, [step]);

  const trials = [91.2, 89.4, 92.0, 88.7, 91.5, 90.8];
  const total = trials.reduce((a, b) => a + b, 0);
  const mu = total / trials.length;
  const sigma = Math.sqrt(
    trials.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (trials.length - 1),
  );
  const cpk = (mu - 70) / (3 * sigma);

  return (
    <main className="relative bg-panel grain">
      {/* Hero */}
      <section className="hero-bg relative pb-20 pt-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="font-mono text-xs uppercase tracking-widest text-brand-400 mb-4 font-semibold">
            PRISM — LLM QUALIFICATION FOR PRODUCTION
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-neutral-100 leading-tight tracking-tight max-w-4xl">
            Stop shipping on
            <br />
            benchmark hype.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-neutral-400 max-w-2xl leading-relaxed">
            PRISM qualifies models the way industrial suppliers get qualified —
            with repeatable measurements, judge-panel validation, and Cpk
            statistics that tell you what actually ships.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4 fade-up">
            <Link href="/dashboard" className="btn-hero">
              Start qualification
              <span className="font-mono text-sm">&rarr;</span>
            </Link>
            <Link
              href="/catalog"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-3 border border-panel-border text-sm font-semibold text-neutral-300 hover:border-brand-400 hover:text-brand-300 transition-colors"
            >
              Browse catalog
            </Link>
          </div>

          {/* Live qualification demo */}
          <div className="mt-16 glass rounded-2xl p-8 max-w-3xl">
            <div className="label-engraved mb-4">Live qualification</div>
            <div className="space-y-2">
              {trials.slice(0, step).map((t, i) => (
                <div
                  key={i}
                  className="fade-up flex items-center gap-3 font-mono text-sm"
                >
                  <span className="text-neutral-500 shrink-0 w-16">
                    T{i + 1}
                  </span>
                  <span
                    className={`h-2 rounded-full ${
                      t >= 90 ? 'bg-brand-400' : 'bg-neutral-600'
                    }`}
                    style={{ width: `${(t - 60) * 3}px` }}
                  />
                  <span className="text-neutral-200">{t.toFixed(1)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-panel-border flex items-end gap-3">
              <div className="text-neutral-500 text-sm">Cpk = {step > trials.length ? cpk.toFixed(2) : '—'}</div>
              <div className="text-sm font-mono text-brand-400">
                {step > trials.length ? 'Qualified' : 'Qualifying…'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three cards */}
      <section className="max-w-7xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-3 gap-4">
        {METRICS.map((m, i) => (
          <div
            key={m.big}
            className="glass rounded-xl p-6 card-lift fade-up"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="readout text-4xl text-gradient font-bold mb-1">
              {m.big}
            </div>
            <div className="label-engraved mb-2">{m.label}</div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              {m.desc} A Cpk ≥ 1.33 means margin of safety; a DPMO of 1,000
              means one fail in a thousand; a 6σ model is world class.
            </p>
          </div>
        ))}
      </section>

      {/* Itinho */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="glass rounded-2xl p-8">
          <div className="label-engraved mb-4">How it works</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {['Intent parsed', '5–10 trial measurement', '3-judge panel', 'Cpk + prediction'].map(
              (stepName, i) => (
                <div key={stepName} className="space-y-1">
                  <div className="font-mono text-xs text-brand-400">
                    Step {i + 1}
                  </div>
                  <div className="text-sm font-semibold text-neutral-100">
                    {stepName}
                  </div>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    {i === 0 && 'Your intent becomes a measurable spec.'}
                    {i === 1 && 'Each candidate runs repeated trials to surface variance.'}
                    {i === 2 && 'Three independent judges validate scoring.'}
                    {i === 3 && 'A recommendation with cost and failure prediction.'}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        id="final"
        className="max-w-7xl mx-auto px-6 pb-32 text-center"
      >
        <div className="glass rounded-2xl p-10 inline-block">
          <div className="label-engraved mb-3">Ready to ship</div>
          <Link href="/dashboard" className="btn-hero">
            Qualify your model now
          </Link>
          <div className="mt-3 font-mono text-[10px] text-neutral-500">
            Free · no login · runs in ~30s
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-panel-border">
        <div className="max-w-7xl mx-auto px-6 py-8 font-mono text-[10px] text-neutral-600 tracking-widest uppercase text-center">
          PRISM · Cpk · σ-level · DPMO · Built by Neekhil
        </div>
      </footer>
    </main>
  );
}
