'use client';

import { FormEvent, useState, useEffect, useCallback } from 'react';
import ModelCard from '../components/ModelCard';
import { MeasureRequest, MeasureResponse, ModelResult } from '../lib/types';

const DEFAULT_LSL = 70;
const DEFAULT_TRIALS = 5;

const PRESET_INTENTS = [
  'Hindi WhatsApp bot for kirana stores',
  'JSON API for e-commerce catalog',
  'English email summarizer',
  'Tamil voice transcription app',
];

const PIPELINE_STEPS = [
  'Parsing Voice of Customer \u2192 CTQ characteristics',
  'Filtering candidate pool (5 models)',
  'Generating test cases (trial {trial}/{total})\u2026',
  'Running 3-judge Gauge R&R panel',
  'Computing Cpk, DPMO, \u03C3-level',
];

type StepStatus = 'pending' | 'active' | 'done';

export default function DashboardPage() {
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeasureResponse | null>(null);
  const [lsl, setLsl] = useState<number>(DEFAULT_LSL);
  const [nTrials, setNTrials] = useState<number>(DEFAULT_TRIALS);
  const [pipelineSteps, setPipelineSteps] = useState<StepStatus[]>([]);
  const [currentTrial, setCurrentTrial] = useState(0);

  const startPipeline = useCallback(() => {
    setPipelineSteps(PIPELINE_STEPS.map(() => 'pending'));
    setCurrentTrial(0);

    const stepDurations = [400, 400, 800, 600, 400];
    let elapsed = 0;

    PIPELINE_STEPS.forEach((_, idx) => {
      // Mark step as active
      setTimeout(() => {
        setPipelineSteps((prev) => {
          const next = [...prev];
          next[idx] = 'active';
          return next;
        });
        // If this is the trial step, animate sub-trials
        if (idx === 2) {
          const trialInterval = stepDurations[2] / (DEFAULT_TRIALS + 1);
          for (let t = 1; t <= DEFAULT_TRIALS; t++) {
            setTimeout(() => setCurrentTrial(t), trialInterval * t);
          }
        }
      }, elapsed);

      // Mark step as done
      elapsed += stepDurations[idx];
      setTimeout(() => {
        setPipelineSteps((prev) => {
          const next = [...prev];
          next[idx] = 'done';
          return next;
        });
      }, elapsed);
    });
  }, []);

  async function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!intent.trim()) return;

    setLoading(true);
    setError(null);
    setData(null);
    startPipeline();

    const body: MeasureRequest = {
      intent: intent.trim(),
      pillar: null,
      n_trials: nTrials,
      lsl,
    };

    try {
      const res = await fetch('/api/measure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      const json = (await res.json()) as MeasureResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      // Mark all steps done when response arrives
      setPipelineSteps(PIPELINE_STEPS.map(() => 'done'));
    }
  }

  function handlePresetClick(preset: string) {
    setIntent(preset);
    // We need to trigger submit after state update
    setTimeout(() => {
      const form = document.getElementById('measure-form') as HTMLFormElement;
      if (form) form.requestSubmit();
    }, 50);
  }

  const sortedResults: ModelResult[] = data
    ? [...data.model_results].sort((a, b) => b.match_score - a.match_score)
    : [];

  return (
    <main className="min-h-screen bg-panel">
      {/* ---- Top bar (instrument nameplate) ---- */}
      <header className="border-b border-panel-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <div>
              <div className="font-mono text-xs text-neutral-500 tracking-widest">
                PRISM v0.1
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
                Process Reliability Index for Supplier Models
              </h1>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 font-mono text-[10px] text-neutral-500 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="led-dot bg-sigma-4" />
              online
            </span>
            <span>/api/measure</span>
          </div>
        </div>
      </header>

      {/* ---- Voice-of-Customer input ---- */}
      <section className="max-w-7xl mx-auto px-6 pt-8 pb-4">
        <form id="measure-form" onSubmit={handleSubmit} className="panel p-4">
          <label
            htmlFor="intent"
            className="label-engraved block mb-2"
          >
            Voice of Customer &mdash; Describe what you&rsquo;re building
          </label>
          <textarea
            id="intent"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="e.g. a customer-support agent that answers billing questions in Spanish and must never speculate about refund eligibility"
            rows={3}
            disabled={loading}
            className="w-full bevel bevel-focus resize-none px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 font-sans"
          />

          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="lsl" className="label-engraved">
                LSL (0-100)
              </label>
              <input
                id="lsl"
                type="number"
                min={0}
                max={100}
                step={1}
                value={lsl}
                onChange={(e) => setLsl(Number(e.target.value))}
                disabled={loading}
                className="bevel bevel-focus px-2 py-1 w-24 font-mono text-sm text-neutral-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="trials" className="label-engraved">
                Trials (n)
              </label>
              <input
                id="trials"
                type="number"
                min={1}
                max={30}
                step={1}
                value={nTrials}
                onChange={(e) => setNTrials(Number(e.target.value))}
                disabled={loading}
                className="bevel bevel-focus px-2 py-1 w-24 font-mono text-sm text-neutral-100"
              />
            </div>

            <div className="ml-auto">
              <button
                type="submit"
                disabled={loading || !intent.trim()}
                className="bevel bevel-focus px-4 py-2 font-mono text-xs uppercase tracking-widest text-neutral-100 hover:bg-panel-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '\u25AA Measuring\u2026' : '\u25B8 Measure Capability'}
              </button>
            </div>
          </div>
        </form>

        {/* ---- Preset intent buttons ---- */}
        <div className="mt-4 panel-inset p-4">
          <div className="label-engraved mb-3">Quick evaluate</div>
          <div className="flex flex-wrap gap-2">
            {PRESET_INTENTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetClick(preset)}
                disabled={loading}
                className="px-3 py-1.5 font-mono text-xs text-neutral-300 border border-panel-border bg-panel-muted hover:bg-panel-border hover:text-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Pipeline visualization ---- */}
      {loading && pipelineSteps.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pb-4">
          <div className="panel p-4">
            <div className="label-engraved mb-3">Measurement Pipeline</div>
            <div className="space-y-1.5">
              {PIPELINE_STEPS.map((step, idx) => {
                const status = pipelineSteps[idx] ?? 'pending';
                let icon: string;
                let textClass: string;
                let iconClass = '';

                if (status === 'done') {
                  icon = '\u2713';
                  textClass = 'text-sigma-4';
                  iconClass = 'text-sigma-4';
                } else if (status === 'active') {
                  icon = '\u25C9';
                  textClass = 'text-neutral-200';
                  iconClass = 'text-neutral-300 pipeline-pulse';
                } else {
                  icon = '\u00A0\u00A0';
                  textClass = 'text-neutral-600';
                  iconClass = 'text-neutral-600';
                }

                // Replace trial placeholder in step 2
                let label = step;
                if (idx === 2 && status === 'active') {
                  label = `Generating test cases (trial ${currentTrial || 1}/${nTrials})\u2026`;
                } else if (idx === 2 && status === 'done') {
                  label = `Generating test cases (${nTrials}/${nTrials})`;
                }

                return (
                  <div key={idx} className="flex items-center gap-3 font-mono text-sm">
                    <span className={`w-5 text-center ${iconClass}`}>
                      [{icon}]
                    </span>
                    <span className={textClass}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ---- Status / error ---- */}
      <section className="max-w-7xl mx-auto px-6">
        {loading && !pipelineSteps.length && <LoadingBanner />}
        {error && (
          <div className="panel border-sigma-1 px-4 py-3 mb-4">
            <div className="label-engraved text-sigma-1 mb-1">Error</div>
            <div className="font-mono text-xs text-neutral-300 break-all">
              {error}
            </div>
          </div>
        )}
        {data && (
          <RunSummary
            wallClock={data.wall_clock_seconds}
            totalCost={data.total_cost_usd}
            traceUrl={data.trace_url}
            nResults={data.model_results.length}
          />
        )}
      </section>

      {/* ---- Results grid ---- */}
      <section className="max-w-7xl mx-auto px-6 pb-12">
        {sortedResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedResults.map((r, i) => (
              <ModelCard
                key={r.model_id}
                result={r}
                lsl={lsl}
                rank={i + 1}
              />
            ))}
          </div>
        )}

        {!loading && !data && !error && <EmptyState />}
      </section>

      <footer className="max-w-7xl mx-auto px-6 py-6 border-t border-panel-border mt-8">
        <div className="font-mono text-[10px] text-neutral-600 tracking-widest uppercase flex flex-wrap items-center justify-between gap-2">
          <span>PRISM &mdash; Six Sigma process control for LLM selection</span>
          <span>Cpk &middot; &sigma;-level &middot; DPMO &middot; Gauge R&amp;R</span>
        </div>
      </footer>
    </main>
  );
}

/* ----------------------------------------------------------------- sub-views */

function LoadingBanner() {
  return (
    <div className="panel px-4 py-3 mb-4">
      <div className="flex items-center gap-3">
        <span className="led-dot bg-sigma-3 animate-none" />
        <div className="font-mono text-xs text-neutral-300 tracking-wider">
          Measuring process capability&hellip;
        </div>
        <div className="ml-auto font-mono text-[10px] text-neutral-500">
          running trials &middot; computing Cpk &middot; estimating DPMO
        </div>
      </div>
      <div className="mt-2 h-1 bg-panel-muted overflow-hidden">
        <div
          className="h-full bg-neutral-500"
          style={{
            width: '40%',
            animation: 'none',
          }}
        />
      </div>
    </div>
  );
}

function RunSummary({
  wallClock,
  totalCost,
  traceUrl,
  nResults,
}: {
  wallClock: number;
  totalCost: number;
  traceUrl: string | null;
  nResults: number;
}) {
  return (
    <div className="panel px-4 py-3 mb-4 flex flex-wrap items-center gap-6">
      <SummaryStat label="models" value={`${nResults}`} />
      <SummaryStat label="wall clock" value={`${wallClock.toFixed(1)}s`} />
      <SummaryStat label="total cost" value={`$${totalCost.toFixed(4)}`} />
      {traceUrl && (
        <a
          href={traceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-100 underline underline-offset-4 decoration-panel-border"
        >
          &#9656; Langfuse trace
        </a>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="label-engraved">{label}</span>
      <span className="readout text-sm text-neutral-100">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="panel px-6 py-12 text-center">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-600 mb-3">
        Awaiting input
      </div>
      <div className="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
        PRISM measures candidate models against your requirement with
        repeated trials, then reports{' '}
        <span className="font-mono text-neutral-200">Cpk</span>,{' '}
        <span className="font-mono text-neutral-200">&sigma;-level</span>, and{' '}
        <span className="font-mono text-neutral-200">DPMO</span> &mdash; the same
        statistical language manufacturing uses to qualify a supplier.
      </div>
      <div className="mt-4 font-mono text-[10px] text-neutral-600 tracking-wider">
        Enter a task above, use a preset, or press Measure Capability.
      </div>
    </div>
  );
}
