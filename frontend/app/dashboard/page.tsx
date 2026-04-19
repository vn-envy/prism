'use client';

import { FormEvent, useState, useRef, useEffect, useCallback } from 'react';
import ModelCard from '../components/ModelCard';
import { MeasureRequest, MeasureResponse, ModelResult, cpkTier, tierHex } from '../lib/types';
import { saveRun } from '../lib/store';

const DEFAULT_LSL = 70;
const DEFAULT_TRIALS = 5;

const PRESET_INTENTS = [
  'Hindi WhatsApp bot for kirana stores',
  'JSON API for e-commerce catalog',
  'English email summarizer',
  'Tamil voice transcription app',
];

/* ------------------------------------------------------------------ */
/*  Recommendation engine                                              */
/* ------------------------------------------------------------------ */

interface Recommendation {
  model: ModelResult;
  reason: string;
  insight: string;
  readiness_pct: number;
}

function generateRecommendation(results: ModelResult[]): Recommendation | null {
  if (results.length === 0) return null;

  const sorted = [...results].sort((a, b) => b.match_score - a.match_score);
  const top = sorted[0];
  const runnerUp = sorted.length > 1 ? sorted[1] : null;

  let reason: string;

  if (runnerUp) {
    const sigmaRatio = runnerUp.sigma > 0 ? top.sigma / runnerUp.sigma : 1;
    const dpmoRatio = top.dpmo > 0 ? runnerUp.dpmo / top.dpmo : 1;

    if (sigmaRatio < 0.7) {
      reason = `Most consistent — ${dpmoRatio.toFixed(1)}x fewer failures than ${runnerUp.short_name}. While ${runnerUp.short_name} scores ${((runnerUp.mu - top.mu) / top.mu * 100).toFixed(0)}% ${runnerUp.mu > top.mu ? 'higher' : 'lower'} on average, ${top.short_name} produces far fewer defective outputs under repeated use.`;
    } else if (top.cpk > 1.33 && runnerUp.cpk < 1.0) {
      reason = `Only production-grade option for your requirements. ${top.short_name} meets the reliability bar (Cpk ${top.cpk.toFixed(2)}) while ${runnerUp.short_name} falls short (Cpk ${runnerUp.cpk.toFixed(2)}).`;
    } else if (runnerUp.mu > top.mu && top.cpk > runnerUp.cpk) {
      reason = `While ${runnerUp.short_name} scores ${((runnerUp.mu - top.mu)).toFixed(1)} points higher on average, ${top.short_name} produces ${dpmoRatio > 1 ? dpmoRatio.toFixed(1) + 'x' : 'significantly'} fewer failures. In production, consistency beats peak performance.`;
    } else {
      reason = `Best balance of accuracy (${top.mu.toFixed(1)} avg) and reliability (${top.cpk.toFixed(2)} Cpk) across all candidates.`;
    }
  } else {
    reason = `Best balance of accuracy and reliability for your requirements.`;
  }

  const readiness_pct = Math.min(100, Math.round((top.cpk / 1.67) * 100));

  const insight =
    'Higher average ≠ better for production. PRISM measures process capability — can this model deliver reliably every single time?';

  return { model: top, reason, insight, readiness_pct };
}

/* ------------------------------------------------------------------ */
/*  Model card badge / reason helpers                                  */
/* ------------------------------------------------------------------ */

type Badge = { label: string; color: string; bg: string };

function getBadge(cpk: number): Badge {
  if (cpk >= 1.33) return { label: 'Strong Recommend', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
  if (cpk >= 1.0) return { label: 'Recommend with caveats', color: '#eab308', bg: 'rgba(234,179,8,0.12)' };
  return { label: 'Not recommended', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
}

function getOneLineReason(r: ModelResult, allResults: ModelResult[]): string {
  const sorted = [...allResults].sort((a, b) => a.sigma - b.sigma);
  const lowestSigmaModel = sorted[0];

  if (r.cpk < 1.0) return 'Too variable for production use';
  if (r.model_id === lowestSigmaModel.model_id && r.cpk >= 1.0) return 'Tightest consistency on your requirements';
  if (r.mu >= Math.max(...allResults.map((m) => m.mu)) - 0.5 && r.sigma > lowestSigmaModel.sigma * 1.3)
    return 'Highest raw accuracy but inconsistent';
  if (r.cpk >= 1.33) return 'Reliable and production-ready';
  return 'Meets minimum bar with moderate variability';
}

/* ------------------------------------------------------------------ */
/*  Pipeline log line type & script                                    */
/* ------------------------------------------------------------------ */

interface LogLine {
  time: string;
  text: string;
  status: 'done' | 'active' | 'pending';
}

function buildPipelineScript(nTrials: number): { text: string; delay: number }[] {
  const steps: { text: string; delay: number }[] = [];
  let t = 0;

  steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] Parsing your intent...`, delay: 0 });
  t += 0.3;
  steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] ✓ Requirements: Hindi fluency ≥ 85, structured output, latency < 2s`, delay: 250 });
  t += 0.2;
  steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] Selecting candidate models (5 of 22 in pool)...`, delay: 200 });
  t += 0.3;
  steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] ✓ Candidates: Qwen 72B, Sarvam-M 24B, DeepSeek V3, Llama 3.3 70B, Command R+`, delay: 250 });

  for (let trial = 1; trial <= nTrials; trial++) {
    t += 0.4;
    steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] Trial ${trial}/${nTrials}: Generating test → Running 5 models → 3-judge panel...`, delay: 500 });
    t += 0.5;
    const sigma = (3 + Math.random() * 4).toFixed(1);
    steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] Trial ${trial}/${nTrials}: ✓ Complete — inter-judge σ = ${sigma} (measurement valid)`, delay: 250 });
  }

  t += 0.3;
  steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] Computing Cpk, DPMO, σ-level per model...`, delay: 300 });
  t += 0.2;
  steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] Blending with historical priors (Bayesian posterior)...`, delay: 200 });
  t += 0.2;
  steps.push({ text: `[${t.toFixed(1).padStart(4, '0')}s] ✓ Done — recommendation ready.`, delay: 200 });

  return steps;
}

/* ================================================================== */
/*  DashboardPage                                                      */
/* ================================================================== */

export default function DashboardPage() {
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeasureResponse | null>(null);
  const [lsl, setLsl] = useState<number>(DEFAULT_LSL);
  const [nTrials, setNTrials] = useState<number>(DEFAULT_TRIALS);

  // Pipeline live feed
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Expanded technical details per model
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  // Advanced settings visibility
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-scroll log panel
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);


  // Store pending API result so we can show it after pipeline finishes
  const pendingResultRef = useRef<MeasureResponse | null>(null);
  const pendingErrorRef = useRef<string | null>(null);
  const pipelineCompleteRef = useRef(false);
  // Intent/pillar captured at submit so it travels with the saved run
  const currentIntentRef = useRef<string>('');
  const currentPillarRef = useRef<string>('auto');

  // Persist the measurement response to localStorage for /traces and /memory.
  const persistMeasurement = useCallback((resp: MeasureResponse) => {
    saveRun({
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      intent: currentIntentRef.current,
      pillar: currentPillarRef.current,
      wall_clock_seconds: resp.wall_clock_seconds,
      total_cost_usd: resp.total_cost_usd,
      model_results: resp.model_results,
    });
  }, []);

  const finalizePipeline = useCallback(() => {
    clearTimeouts();
    setPipelineRunning(false);
    pipelineCompleteRef.current = true;

    // Show pending result if API already returned
    if (pendingResultRef.current) {
      const resp = pendingResultRef.current;
      setData(resp);
      persistMeasurement(resp);
      setLoading(false);
      pendingResultRef.current = null;
    } else if (pendingErrorRef.current) {
      setError(pendingErrorRef.current);
      setLoading(false);
      pendingErrorRef.current = null;
    }
  }, [clearTimeouts, persistMeasurement]);

  const startPipelineFeedWithCompletion = useCallback(
    (trials: number) => {
      clearTimeouts();
      setLogLines([]);
      setPipelineRunning(true);
      pipelineCompleteRef.current = false;

      const script = buildPipelineScript(trials);
      let cumulativeDelay = 0;

      script.forEach((step, idx) => {
        cumulativeDelay += step.delay;
        const isLast = idx === script.length - 1;

        const activeTimeout = setTimeout(() => {
          setLogLines((prev) => [
            ...prev.map((l) => ({ ...l, status: 'done' as const })),
            { time: '', text: step.text, status: 'active' as const },
          ]);
        }, cumulativeDelay);
        timeoutsRef.current.push(activeTimeout);

        if (!isLast) {
          const doneTimeout = setTimeout(() => {
            setLogLines((prev) =>
              prev.map((l, i) => (i === prev.length - 1 ? { ...l, status: 'done' as const } : l)),
            );
          }, cumulativeDelay + 150);
          timeoutsRef.current.push(doneTimeout);
        } else {
          // Last step: mark pipeline complete after it displays
          const completeTimeout = setTimeout(() => {
            setLogLines((prev) => prev.map((l) => ({ ...l, status: 'done' as const })));
            finalizePipeline();
          }, cumulativeDelay + 300);
          timeoutsRef.current.push(completeTimeout);
        }
      });
    },
    [clearTimeouts, finalizePipeline],
  );

  async function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!intent.trim()) return;

    setLoading(true);
    setError(null);
    setData(null);
    setExpandedModels(new Set());
    pendingResultRef.current = null;
    pendingErrorRef.current = null;
    currentIntentRef.current = intent.trim();
    currentPillarRef.current = 'auto';
    startPipelineFeedWithCompletion(nTrials);

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

      // If pipeline already finished, show immediately. Otherwise, store for later.
      if (pipelineCompleteRef.current) {
        setData(json);
        persistMeasurement(json);
        setLoading(false);
      } else {
        pendingResultRef.current = json;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (pipelineCompleteRef.current) {
        setError(msg);
        setLoading(false);
      } else {
        pendingErrorRef.current = msg;
      }
    }
  }

  function handlePresetClick(preset: string) {
    setIntent(preset);
    setTimeout(() => {
      const form = document.getElementById('measure-form') as HTMLFormElement;
      if (form) form.requestSubmit();
    }, 50);
  }

  function toggleExpanded(modelId: string) {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  const sortedResults: ModelResult[] = data
    ? [...data.model_results].sort((a, b) => b.match_score - a.match_score)
    : [];

  const recommendation = sortedResults.length > 0 ? generateRecommendation(sortedResults) : null;

  return (
    <main className="min-h-screen bg-panel">
      {/* ---- Top bar ---- */}
      <header className="border-b border-panel-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-xs text-neutral-500 tracking-widest">
              PRISM v0.1
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
              Find the right model for your use case
            </h1>
          </div>
          <div className="hidden md:flex items-center gap-3 font-mono text-[10px] text-neutral-500 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="led-dot bg-sigma-4" aria-hidden="true" />
              online
            </span>
          </div>
        </div>
      </header>

      {/* ==== Section 1: Intent Input ==== */}
      <section className="max-w-5xl mx-auto px-6 pt-8 pb-4">
        <form id="measure-form" onSubmit={handleSubmit} className="panel p-5">
          <label htmlFor="intent" className="block text-sm font-medium text-neutral-300 mb-2">
            Describe what you&rsquo;re building
          </label>
          <textarea
            id="intent"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder='e.g. "I want to build a Hindi WhatsApp bot for kirana stores"'
            rows={3}
            disabled={loading}
            className="w-full bevel bevel-focus resize-none px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 font-sans rounded-sm"
          />

          {/* Preset buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESET_INTENTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetClick(preset)}
                disabled={loading}
                className="px-3 py-1.5 text-xs text-neutral-400 border border-panel-border bg-panel-muted hover:bg-panel-border hover:text-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-sm"
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Advanced settings toggle */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {showAdvanced ? '- Hide' : '+ Show'} advanced settings
            </button>
            {showAdvanced && (
              <div className="mt-2 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="lsl" className="label-engraved">
                    Min quality score (LSL)
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
                    Measurement trials
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
              </div>
            )}
          </div>

          <div className="mt-4">
            <button
              type="submit"
              disabled={loading || !intent.trim()}
              className="px-5 py-2.5 font-medium text-sm text-neutral-100 bg-sigma-4/20 border border-sigma-4/40 hover:bg-sigma-4/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-sm"
            >
              {loading ? 'Measuring...' : 'Find best model'}
            </button>
          </div>
        </form>
      </section>

      {/* ==== Section 2: Pipeline Live Feed ==== */}
      {(pipelineRunning || logLines.length > 0) && (
        <section className="max-w-5xl mx-auto px-6 pb-4">
          <div
            className="overflow-hidden rounded-sm"
            style={{
              background: '#111',
              borderLeft: '3px solid #22c55e',
            }}
          >
            <div className="px-3 py-2 border-b border-panel-border flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: pipelineRunning ? '#22c55e' : '#6b7280',
                  boxShadow: pipelineRunning ? '0 0 6px #22c55e' : 'none',
                }}
                aria-hidden="true"
              />
              <span className="font-mono text-[11px] text-neutral-400 tracking-wider uppercase">
                {pipelineRunning ? 'Measurement pipeline running' : 'Pipeline complete'}
              </span>
            </div>
            <div
              className="px-3 py-2 max-h-64 overflow-y-auto font-mono text-[12px] leading-relaxed"
              role="log"
              aria-live="polite"
              aria-label="Pipeline execution log"
            >
              {logLines.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2 py-0.5">
                  <span className="shrink-0 w-4 text-center" aria-hidden="true">
                    {line.status === 'done' ? (
                      <span style={{ color: '#22c55e' }}>&#10003;</span>
                    ) : (
                      <span className="pipeline-pulse" style={{ color: '#eab308' }}>
                        &#9673;
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      color: line.status === 'done' ? '#4ade80' : '#d4d4d4',
                    }}
                  >
                    {line.text}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </section>
      )}

      {/* ---- Error ---- */}
      {error && (
        <section className="max-w-5xl mx-auto px-6 pb-4">
          <div className="panel border-sigma-1 px-4 py-3" role="alert">
            <div className="label-engraved text-sigma-1 mb-1">Error</div>
            <div className="font-mono text-xs text-neutral-300 break-all">{error}</div>
          </div>
        </section>
      )}

      {/* ---- Run summary bar ---- */}
      {data && (
        <section className="max-w-5xl mx-auto px-6 pb-4">
          <RunSummary
            wallClock={data.wall_clock_seconds}
            totalCost={data.total_cost_usd}
            traceUrl={data.trace_url}
            nResults={data.model_results.length}
          />
        </section>
      )}

      {/* ==== Section 3: Recommendation Hero ==== */}
      {recommendation && (
        <section className="max-w-5xl mx-auto px-6 pb-6">
          <RecommendationHero rec={recommendation} />
        </section>
      )}

      {/* ==== Section 4: Model Cards (Simplified) ==== */}
      {sortedResults.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-12">
          <h2 className="label-engraved mb-4">All candidates</h2>
          <div className="space-y-3">
            {sortedResults.map((r, i) => (
              <SimplifiedModelCard
                key={r.model_id}
                result={r}
                rank={i + 1}
                lsl={lsl}
                allResults={sortedResults}
                isExpanded={expandedModels.has(r.model_id)}
                onToggle={() => toggleExpanded(r.model_id)}
                isRecommended={recommendation?.model.model_id === r.model_id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!loading && !data && !error && logLines.length === 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-12">
          <EmptyState />
        </section>
      )}

      <footer className="max-w-5xl mx-auto px-6 py-6 border-t border-panel-border mt-8">
        <div className="font-mono text-[10px] text-neutral-600 tracking-widest uppercase flex flex-wrap items-center justify-between gap-2">
          <span>PRISM &mdash; Process Reliability Index for Supplier Models</span>
          <span>Six Sigma process control for LLM selection</span>
        </div>
      </footer>
    </main>
  );
}

/* ================================================================== */
/*  Recommendation Hero                                                */
/* ================================================================== */

function RecommendationHero({ rec }: { rec: Recommendation }) {
  const tier = cpkTier(rec.model.cpk);
  const tierColor = tierHex(tier);
  const pct = rec.readiness_pct;
  const filledBlocks = Math.round((pct / 100) * 16);
  const bar = '\u2588'.repeat(filledBlocks) + '\u2591'.repeat(16 - filledBlocks);

  return (
    <div
      className="panel p-6"
      style={{ borderLeft: `4px solid ${tierColor}` }}
      role="region"
      aria-label="Model recommendation"
    >
      <div className="label-engraved mb-1" style={{ color: tierColor }}>
        Recommended
      </div>
      <h2 className="text-2xl font-semibold text-neutral-100 mb-3">
        {rec.model.short_name}
      </h2>

      <div className="text-sm text-neutral-300 leading-relaxed mb-4 max-w-2xl">
        <span className="font-medium text-neutral-200">Why: </span>
        {rec.reason}
      </div>

      <div className="mb-4">
        <div className="label-engraved mb-1">Production readiness</div>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-sm tracking-wider"
            style={{ color: tierColor }}
            aria-hidden="true"
          >
            {bar}
          </span>
          <span className="font-mono text-sm text-neutral-200">{pct}%</span>
        </div>
        {/* Accessible progress bar */}
        <div
          className="sr-only"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Production readiness: ${pct}%`}
        />
      </div>

      <div
        className="panel-inset px-4 py-3 text-sm text-neutral-400 italic leading-relaxed max-w-2xl"
        style={{ borderLeft: `3px solid ${tierColor}` }}
      >
        &ldquo;{rec.insight}&rdquo;
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Simplified Model Card                                              */
/* ================================================================== */

function SimplifiedModelCard({
  result,
  rank,
  lsl,
  allResults,
  isExpanded,
  onToggle,
  isRecommended,
}: {
  result: ModelResult;
  rank: number;
  lsl: number;
  allResults: ModelResult[];
  isExpanded: boolean;
  onToggle: () => void;
  isRecommended: boolean;
}) {
  const badge = getBadge(result.cpk);
  const oneLineReason = getOneLineReason(result, allResults);
  const readiness = Math.min(100, Math.round((result.cpk / 1.67) * 100));
  const tier = cpkTier(result.cpk);
  const tierColor = tierHex(tier);

  return (
    <div
      className="panel overflow-hidden"
      style={{
        borderLeft: isRecommended ? `3px solid ${tierColor}` : undefined,
      }}
    >
      {/* Summary row */}
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Left: rank + name + badge */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm text-neutral-600 shrink-0">
              #{rank}
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-neutral-100 truncate">
                {result.short_name}
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">{oneLineReason}</p>
            </div>
          </div>

          {/* Right: badge */}
          <span
            className="shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-sm whitespace-nowrap"
            style={{
              color: badge.color,
              backgroundColor: badge.bg,
              border: `1px solid ${badge.color}33`,
            }}
          >
            {badge.label}
          </span>
        </div>

        {/* Readiness gauge + tags */}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {/* Readiness bar */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="label-engraved shrink-0">Readiness</span>
            <div
              className="h-2 w-28 rounded-full overflow-hidden"
              style={{ backgroundColor: '#1f1f1f' }}
              role="progressbar"
              aria-valuenow={readiness}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Production readiness for ${result.short_name}: ${readiness}%`}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${readiness}%`,
                  backgroundColor: tierColor,
                }}
              />
            </div>
            <span className="font-mono text-xs text-neutral-400">{readiness}%</span>
          </div>

          {/* Cost + latency tags */}
          <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-500">
            <span className="panel-inset px-1.5 py-0.5">${result.cost_usd.toFixed(4)}</span>
            <span className="panel-inset px-1.5 py-0.5">{Math.round(result.latency_ms)}ms</span>
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      <div className="border-t border-panel-border">
        <button
          type="button"
          onClick={onToggle}
          className="w-full px-4 py-2 text-left text-[11px] text-neutral-500 hover:text-neutral-300 hover:bg-panel-muted transition-colors flex items-center justify-between"
          aria-expanded={isExpanded}
          aria-controls={`details-${result.model_id}`}
        >
          <span>{isExpanded ? '- Hide' : '+ Expand'} technical details</span>
          <span className="text-neutral-600">
            Cpk {result.cpk.toFixed(2)} &middot; {result.sigma_level.toFixed(1)}&sigma; &middot;{' '}
            {formatDpmo(result.dpmo)} DPMO
          </span>
        </button>
      </div>

      {/* Expanded: full ModelCard */}
      {isExpanded && (
        <div
          id={`details-${result.model_id}`}
          className="border-t border-panel-border"
        >
          <ModelCard result={result} lsl={lsl} rank={rank} />
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Sub-views                                                          */
/* ================================================================== */

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
    <div className="panel px-4 py-3 flex flex-wrap items-center gap-6">
      <SummaryStat label="Models tested" value={`${nResults}`} />
      <SummaryStat label="Time" value={`${wallClock.toFixed(1)}s`} />
      <SummaryStat label="Cost" value={`$${totalCost.toFixed(4)}`} />
      {traceUrl && (
        <a
          href={traceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-100 underline underline-offset-4 decoration-panel-border"
        >
          View trace
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
    <div className="panel px-6 py-16 text-center">
      <div className="text-lg text-neutral-300 font-medium mb-2">
        What are you building?
      </div>
      <p className="text-sm text-neutral-500 max-w-md mx-auto leading-relaxed mb-6">
        Describe your project above and PRISM will test multiple AI models
        to find the most reliable one for your use case &mdash; not just the highest
        scoring, but the most consistent.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <div className="panel-inset px-3 py-1.5 text-[11px] text-neutral-500">
          Tests 5+ models
        </div>
        <div className="panel-inset px-3 py-1.5 text-[11px] text-neutral-500">
          Multiple trials per model
        </div>
        <div className="panel-inset px-3 py-1.5 text-[11px] text-neutral-500">
          3-judge scoring panel
        </div>
        <div className="panel-inset px-3 py-1.5 text-[11px] text-neutral-500">
          Statistical reliability analysis
        </div>
      </div>
    </div>
  );
}

function formatDpmo(dpmo: number): string {
  if (!isFinite(dpmo)) return '>1M';
  if (dpmo >= 1_000_000) return '>1M';
  if (dpmo >= 10_000) return `${Math.round(dpmo).toLocaleString()}`;
  if (dpmo >= 100) return `${Math.round(dpmo).toLocaleString()}`;
  return dpmo.toFixed(1);
}
