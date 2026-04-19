'use client';

import Link from 'next/link';
import DistributionCurve from '../components/DistributionCurve';
import { cpkTier, tierHex, tierLabel } from '../lib/types';

/**
 * /compare — side-by-side model comparison.
 *
 * The thesis of the page: Cpk, not accuracy, determines whether a model is
 * a production-grade supplier. Hardcoded with the "Sarvam vs GPT-OSS" demo
 * pairing from the playbook so the page renders instantly at a demo.
 */

interface ComparisonModel {
  name: string;
  parametersB: number;
  mu: number;
  sigma: number;
  lsl: number;
  cpk: number;
  dpmo: number;
  sigmaLevel: number;
  verdict: string;
  verdictTone: 'pass' | 'fail';
}

const LEFT: ComparisonModel = {
  name: 'Sarvam-M 24B',
  parametersB: 24,
  mu: 87.3,
  sigma: 4.2,
  lsl: 70,
  cpk: 1.37,
  dpmo: 5_400,
  sigmaLevel: 4.1,
  verdict: 'Production-grade',
  verdictTone: 'pass',
};

const RIGHT: ComparisonModel = {
  name: 'GPT-OSS 120B',
  parametersB: 120,
  mu: 91.5,
  sigma: 11.8,
  lsl: 70,
  cpk: 0.61,
  dpmo: 34_200,
  sigmaLevel: 3.3,
  verdict: 'Not production-grade',
  verdictTone: 'fail',
};

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-panel">
      {/* ---- Top bar ---- */}
      <header className="border-b border-panel-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-xs text-neutral-500 tracking-widest">
              PRISM v0.1 · /compare
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
              Supplier comparison — why Cpk beats accuracy
            </h1>
          </div>
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-100 underline underline-offset-4 decoration-panel-border"
          >
            ◂ Back to dashboard
          </Link>
        </div>
      </header>

      {/* ---- Comparison panels ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-8 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModelPanel model={LEFT} slot="A" />
          <ModelPanel model={RIGHT} slot="B" />
        </div>
      </section>

      {/* ---- Callout ---- */}
      <section className="max-w-7xl mx-auto px-6 pb-12">
        <Callout />
      </section>

      <footer className="max-w-7xl mx-auto px-6 py-6 border-t border-panel-border mt-4">
        <div className="font-mono text-[10px] text-neutral-600 tracking-widest uppercase flex flex-wrap items-center justify-between gap-2">
          <span>PRISM — Six Sigma process control for LLM selection</span>
          <span>Cpk · σ-level · DPMO · Gauge R&amp;R</span>
        </div>
      </footer>
    </main>
  );
}

/* ----------------------------------------------------------------- subviews */

function ModelPanel({
  model,
  slot,
}: {
  model: ComparisonModel;
  slot: 'A' | 'B';
}) {
  const tier = cpkTier(model.cpk);
  const cpkColor = tierHex(tier);
  const verdictColor = model.verdictTone === 'pass' ? '#22c55e' : '#ef4444';

  return (
    <div className="panel p-5 flex flex-col gap-4">
      {/* Header — nameplate */}
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="label-engraved">Slot {slot}</div>
          <div className="text-lg font-semibold text-neutral-100 tracking-tight">
            {model.name}
          </div>
        </div>
        <div className="text-right">
          <div className="label-engraved">Parameters</div>
          <div className="readout text-sm text-neutral-300">
            {model.parametersB}B
          </div>
        </div>
      </div>

      <div className="rule" />

      {/* Cpk — hero readout */}
      <div className="panel-inset px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="label-engraved">Cpk</span>
          <span className="text-[9px] uppercase tracking-widest text-neutral-600">
            Process Capability
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span
            className="readout text-6xl font-semibold leading-none"
            style={{ color: cpkColor }}
          >
            {model.cpk.toFixed(2)}
          </span>
          <span className="readout text-xs" style={{ color: cpkColor }}>
            {tierLabel(tier)}
          </span>
        </div>
      </div>

      {/* σ-level + DPMO badge */}
      <div
        className="panel-inset px-3 py-2 flex flex-col"
        style={{ borderLeft: `3px solid ${cpkColor}` }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="label-engraved">σ-Level</span>
          <span
            className="readout text-2xl font-semibold"
            style={{ color: cpkColor }}
          >
            {model.sigmaLevel.toFixed(1)}σ
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-4 mt-1">
          <span className="label-engraved">DPMO</span>
          <span className="readout text-xs text-neutral-300">
            {model.dpmo.toLocaleString()}
          </span>
        </div>
      </div>

      {/* μ / σ readouts */}
      <div className="grid grid-cols-3 gap-2">
        <Readout label="μ" value={model.mu.toFixed(1)} />
        <Readout label="σ" value={model.sigma.toFixed(1)} />
        <Readout label="LSL" value={model.lsl.toFixed(0)} />
      </div>

      {/* Distribution curve */}
      <div className="panel-inset p-3">
        <div className="flex items-baseline justify-between mb-1">
          <span className="label-engraved">Output distribution</span>
          <span className="text-[9px] uppercase tracking-widest text-neutral-600">
            N(μ, σ²)
          </span>
        </div>
        <div className="flex justify-center">
          <DistributionCurve
            mu={model.mu}
            sigma={model.sigma}
            lsl={model.lsl}
            width={340}
            height={160}
          />
        </div>
      </div>

      {/* Verdict plate */}
      <div
        className="panel-inset px-3 py-2 flex items-center gap-3"
        style={{ borderLeft: `3px solid ${verdictColor}` }}
      >
        <span
          className="led-dot"
          style={{ backgroundColor: verdictColor }}
        />
        <span className="label-engraved">Verdict</span>
        <span
          className="readout text-sm ml-auto"
          style={{ color: verdictColor }}
        >
          {model.verdict}
        </span>
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-inset px-3 py-2">
      <div className="label-engraved">{label}</div>
      <div className="readout text-lg text-neutral-100 leading-tight">
        {value}
      </div>
    </div>
  );
}

function Callout() {
  return (
    <div className="panel p-5">
      <div className="label-engraved mb-3">Interpretation</div>
      <div className="font-sans text-sm text-neutral-300 leading-relaxed space-y-3 max-w-3xl">
        <p>
          <span className="readout text-neutral-100">GPT-OSS 120B</span> has
          higher average performance{' '}
          <span className="readout text-neutral-400">(μ=91.5 vs 87.3)</span>.
          Every leaderboard would rank it #1.
        </p>
        <p>
          But its process variance{' '}
          <span className="readout text-neutral-400">(σ=11.8)</span> means it
          will produce{' '}
          <span className="readout font-semibold text-sigma-1">
            34,200 defective outputs per million calls
          </span>
          .
        </p>
        <p>
          Sarvam-M&rsquo;s tighter process{' '}
          <span className="readout text-neutral-400">(σ=4.2)</span> produces
          only{' '}
          <span className="readout font-semibold text-sigma-4">
            5,400 defects per million
          </span>
          .
        </p>
        <p className="pt-1 border-t border-panel-border mt-3">
          <span className="font-semibold text-neutral-100">
            Cpk inverts the leaderboard. The &ldquo;worse&rdquo; model is the
            better supplier.
          </span>
        </p>
      </div>
    </div>
  );
}
