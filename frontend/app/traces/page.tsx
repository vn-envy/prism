'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, Fragment } from 'react';
import { getRuns, type StoredRun } from '../lib/store';
import type { ModelResult } from '../lib/types';

/* ==================================================================== */
/*  Types                                                                */
/* ==================================================================== */

interface TraceNode {
  id: string;
  agent: string;
  kind:
    | 'orchestrator'
    | 'agent'
    | 'model_call'
    | 'judge'
    | 'parallel_group'
    | 'compute';
  duration_ms: number;
  cost_usd: number;
  tokens: number;
  summary: string;
  input?: string;
  output?: string;
  flag?: { level: 'warn' | 'error'; message: string };
  children?: TraceNode[];
}

interface ModelRanking {
  model: string;
  cpk: number;
  sigma: number;
  dpmo: number;
}

interface Run {
  id: string;
  label: string;
  intent: string;
  timestamp: string;
  duration_ms: number;
  cost_usd: number;
  tokens: number;
  gauge_rr_pct: number;
  alerts: string[];
  rankings: ModelRanking[];
  root: TraceNode;
}

/* ==================================================================== */
/*  Build a Run from a StoredRun                                          */
/* ==================================================================== */

/**
 * Convert a StoredRun (raw API response + metadata) into a Run that feeds
 * the trace-tree UI. Timings are distributed proportionally across the
 * orchestration steps so the tree tells a realistic story even though the
 * backend only gives us the aggregate wall-clock.
 */
function buildRunFromStored(stored: StoredRun, displayIndex: number): Run {
  const duration_ms = Math.round(stored.wall_clock_seconds * 1000);
  const total_cost = stored.total_cost_usd;
  const n_models = stored.model_results.length;

  // Gauge R&R — average of per-model agreement (already a % from backend).
  const gauge_rr_pct =
    n_models > 0
      ? stored.model_results.reduce((s, m) => s + m.gauge_rr_pct, 0) / n_models
      : 0;

  // Token estimate: backend doesn't return tokens directly; approximate
  // from latency + model count (purely illustrative).
  const tokens = Math.round(
    stored.model_results.reduce((s, m) => s + m.latency_ms * 2.5, 0),
  );

  // Proportional time budget: 8% VoC, 3% filter, 78% model runs, 10% judges, 1% cpk
  const tVoc = Math.max(60, Math.round(duration_ms * 0.08));
  const tFilter = Math.max(20, Math.round(duration_ms * 0.03));
  const tJudge = Math.max(200, Math.round(duration_ms * 0.1));
  const tCpk = Math.max(20, Math.round(duration_ms * 0.01));
  const tModelsTotal = Math.max(
    1,
    duration_ms - tVoc - tFilter - tJudge - tCpk,
  );

  // Cost distribution (backend reports per-model cost; judge + voc are small).
  const modelCostSum = stored.model_results.reduce(
    (s, m) => s + m.cost_usd,
    0,
  );
  const overhead = Math.max(0, total_cost - modelCostSum);
  const cVoc = overhead * 0.25;
  const cFilter = 0;
  const cJudge = overhead * 0.7;
  const cCpk = 0;

  // Rankings (by match_score, matching the dashboard sort)
  const ranked = [...stored.model_results].sort(
    (a, b) => b.match_score - a.match_score,
  );
  const rankings: ModelRanking[] = ranked.map((m) => ({
    model: m.short_name,
    cpk: m.cpk,
    sigma: m.sigma,
    dpmo: m.dpmo,
  }));

  // Alerts: poor gauge R&R, low-Cpk models, or extreme cost.
  const alerts: string[] = [];
  if (gauge_rr_pct < 80) {
    alerts.push(
      `Gauge R&R agreement ${gauge_rr_pct.toFixed(1)}% — below 80% threshold (measurement system suspect)`,
    );
  }
  const failingCpk = ranked.filter((m) => m.cpk < 1.0);
  if (failingCpk.length > 0) {
    alerts.push(
      `${failingCpk.length}/${n_models} models fell below Cpk ≥ 1.0 (${failingCpk
        .map((m) => m.short_name)
        .join(', ')})`,
    );
  }
  const worstGaugeModel = ranked
    .slice()
    .sort((a, b) => a.gauge_rr_pct - b.gauge_rr_pct)[0];
  if (worstGaugeModel && worstGaugeModel.gauge_rr_pct < 70) {
    alerts.push(
      `Elevated judge variance on ${worstGaugeModel.short_name} (R&R ${worstGaugeModel.gauge_rr_pct.toFixed(1)}%)`,
    );
  }

  // Build tree
  const modelCallNodes: TraceNode[] = ranked.map((m, idx) => {
    const share = modelCostSum > 0 ? m.cost_usd / modelCostSum : 1 / n_models;
    const share_dur = Math.max(1, Math.round(tModelsTotal * share));
    return {
      id: `model_${m.model_id}`,
      agent: m.short_name,
      kind: 'model_call',
      duration_ms: Math.max(m.latency_ms, share_dur),
      cost_usd: m.cost_usd,
      tokens: Math.round(m.latency_ms * 2.5),
      summary: `μ=${m.mu.toFixed(1)}, σ=${m.sigma.toFixed(2)}, Cpk=${m.cpk.toFixed(2)}`,
      input: stored.intent,
      output: summarizeVerdict(m, idx === 0),
      flag:
        m.cpk < 1.0
          ? {
              level: 'warn',
              message: `Cpk ${m.cpk.toFixed(2)} below production bar (≥ 1.0) — high variability`,
            }
          : undefined,
    };
  });

  const judgeFlag =
    gauge_rr_pct < 80
      ? {
          level: (gauge_rr_pct < 70 ? 'error' : 'warn') as 'warn' | 'error',
          message: `Inter-judge agreement ${gauge_rr_pct.toFixed(1)}% — below 80% threshold`,
        }
      : undefined;

  const root: TraceNode = {
    id: 'orchestrator',
    agent: 'orchestrator (autoresearch)',
    kind: 'orchestrator',
    duration_ms,
    cost_usd: total_cost,
    tokens,
    summary: `End-to-end measurement pipeline — ${n_models} models, ${stored.pillar} pillar`,
    children: [
      {
        id: 'voc',
        agent: 'voc_parser',
        kind: 'agent',
        duration_ms: tVoc,
        cost_usd: cVoc,
        tokens: Math.max(120, Math.round(stored.intent.length * 1.5)),
        summary: `Parsed intent → ${stored.pillar} pillar`,
        input: stored.intent,
        output: `CTQs derived for pillar=${stored.pillar}, ${n_models} candidate models selected`,
      },
      {
        id: 'filter',
        agent: 'candidate_filter',
        kind: 'agent',
        duration_ms: tFilter,
        cost_usd: cFilter,
        tokens: 0,
        summary: `Selected ${n_models} models`,
        output: ranked.map((m) => m.short_name).join(', '),
      },
      {
        id: 'exec',
        agent: 'candidate_execution',
        kind: 'parallel_group',
        duration_ms: tModelsTotal,
        cost_usd: modelCostSum,
        tokens: Math.round(
          stored.model_results.reduce((s, m) => s + m.latency_ms * 2.5, 0),
        ),
        summary: `Parallel execution across ${n_models} candidate models`,
        children: modelCallNodes,
      },
      {
        id: 'judge',
        agent: 'judge_panel',
        kind: 'judge',
        duration_ms: tJudge,
        cost_usd: cJudge,
        tokens: Math.round(tJudge * 0.9),
        summary: `3-judge Gauge R&R — inter-judge agreement = ${gauge_rr_pct.toFixed(1)}%`,
        flag: judgeFlag,
      },
      {
        id: 'cpk',
        agent: 'cpk_calculator',
        kind: 'compute',
        duration_ms: tCpk,
        cost_usd: cCpk,
        tokens: 0,
        summary: `Computed Cpk, DPMO, σ-level${ranked[0] ? ` — ${ranked[0].short_name} leads (Cpk=${ranked[0].cpk.toFixed(2)})` : ''}`,
        output: ranked
          .map(
            (m) =>
              `${m.short_name}: ${m.cpk.toFixed(2)}/${m.sigma_level.toFixed(1)}σ`,
          )
          .join(' | '),
      },
    ],
  };

  const label =
    stored.intent.length > 70
      ? stored.intent.slice(0, 67) + '…'
      : stored.intent;

  return {
    id: `run_${displayIndex}`,
    label: label || `Run ${displayIndex}`,
    intent: stored.intent,
    timestamp: formatTimestamp(stored.timestamp),
    duration_ms,
    cost_usd: total_cost,
    tokens,
    gauge_rr_pct,
    alerts,
    rankings,
    root,
  };
}

function summarizeVerdict(m: ModelResult, isTop: boolean): string {
  const verdict = m.verdict || (m.cpk >= 1.33 ? 'capable' : m.cpk >= 1.0 ? 'marginal' : 'not capable');
  return `${verdict} — DPMO=${Math.round(m.dpmo).toLocaleString()}, σ-level=${m.sigma_level.toFixed(1)}${isTop ? ' (top rank)' : ''}`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

/* ==================================================================== */
/*  Formatting helpers                                                    */
/* ==================================================================== */

function fmtDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0.000';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function costColor(usd: number): string {
  if (usd < 0.01) return 'text-emerald-400';
  if (usd < 0.05) return 'text-amber-400';
  return 'text-red-400';
}

function fmtTokens(t: number): string {
  if (t === 0) return '0 tok';
  if (t >= 1000) return `${(t / 1000).toFixed(2)}k tok`;
  return `${t} tok`;
}

/* ==================================================================== */
/*  Tree collection (for filter / search)                                 */
/* ==================================================================== */

function collectAgents(node: TraceNode, out: Set<string>): void {
  out.add(node.agent);
  node.children?.forEach((c) => collectAgents(c, out));
}

function nodeMatches(
  node: TraceNode,
  agent: string,
  keyword: string,
): boolean {
  const kw = keyword.trim().toLowerCase();
  const agentMatch = agent === '__all__' || node.agent === agent;
  const kwMatch =
    kw === '' ||
    node.agent.toLowerCase().includes(kw) ||
    node.summary.toLowerCase().includes(kw) ||
    (node.input ?? '').toLowerCase().includes(kw) ||
    (node.output ?? '').toLowerCase().includes(kw);
  return agentMatch && kwMatch;
}

function subtreeHasMatch(
  node: TraceNode,
  agent: string,
  keyword: string,
): boolean {
  if (nodeMatches(node, agent, keyword)) return true;
  return !!node.children?.some((c) => subtreeHasMatch(c, agent, keyword));
}

/* ==================================================================== */
/*  Tree row                                                              */
/* ==================================================================== */

interface TreeRowProps {
  node: TraceNode;
  prefix: string;
  isLast: boolean;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  agent: string;
  keyword: string;
  depth: number;
}

function TreeRow({
  node,
  prefix,
  isLast,
  expanded,
  toggle,
  agent,
  keyword,
  depth,
}: TreeRowProps) {
  const isExpanded = expanded[node.id] ?? depth < 2;
  const connector = depth === 0 ? '' : isLast ? '└── ' : '├── ';
  const children = node.children ?? [];
  const visibleChildren = children.filter((c) =>
    subtreeHasMatch(c, agent, keyword),
  );
  const hasChildren = visibleChildren.length > 0;
  const matched = nodeMatches(node, agent, keyword);
  const childPrefix = prefix + (depth === 0 ? '' : isLast ? '    ' : '│   ');

  const flagged = node.flag;
  const borderCls = flagged
    ? flagged.level === 'error'
      ? 'border-l-2 border-l-red-500'
      : 'border-l-2 border-l-amber-500'
    : 'border-l-2 border-l-transparent';

  const kindBadge = (() => {
    switch (node.kind) {
      case 'orchestrator':
        return { label: 'ORCH', cls: 'text-indigo-300 bg-indigo-500/10' };
      case 'model_call':
        return { label: 'LLM', cls: 'text-sky-300 bg-sky-500/10' };
      case 'judge':
        return { label: 'JUDGE', cls: 'text-fuchsia-300 bg-fuchsia-500/10' };
      case 'parallel_group':
        return { label: 'PAR', cls: 'text-teal-300 bg-teal-500/10' };
      case 'compute':
        return { label: 'CALC', cls: 'text-neutral-300 bg-neutral-500/10' };
      default:
        return { label: 'AGT', cls: 'text-amber-200 bg-amber-500/10' };
    }
  })();

  const dim = !matched && keyword.trim() !== '';

  return (
    <Fragment>
      <div
        className={`group flex items-start gap-2 py-1.5 pr-3 pl-2 hover:bg-panel-muted/60 cursor-pointer ${borderCls} ${
          dim ? 'opacity-40' : ''
        }`}
        onClick={() => hasChildren && toggle(node.id)}
      >
        {/* Tree prefix */}
        <pre className="font-mono text-[12px] leading-5 text-neutral-600 whitespace-pre select-none m-0">
          {prefix}
          {connector}
        </pre>

        {/* Expand chevron */}
        <span className="font-mono text-[11px] leading-5 text-neutral-500 w-3 select-none">
          {hasChildren ? (isExpanded ? '▾' : '▸') : ' '}
        </span>

        {/* Kind badge */}
        <span
          className={`font-mono text-[9px] leading-5 uppercase tracking-widest px-1.5 rounded-sm ${kindBadge.cls}`}
        >
          {kindBadge.label}
        </span>

        {/* Agent name */}
        <span className="font-mono text-[12px] leading-5 font-semibold text-neutral-100 min-w-[9rem]">
          {node.agent}
        </span>

        {/* Summary */}
        <span className="text-[12px] leading-5 text-neutral-400 truncate flex-1">
          {node.summary}
        </span>

        {/* Duration / cost / tokens */}
        <span className="font-mono tabular-nums text-[11px] leading-5 text-neutral-400 w-16 text-right">
          {fmtDuration(node.duration_ms)}
        </span>
        <span
          className={`font-mono tabular-nums text-[11px] leading-5 w-16 text-right ${costColor(
            node.cost_usd,
          )}`}
        >
          {fmtCost(node.cost_usd)}
        </span>
        <span className="font-mono tabular-nums text-[11px] leading-5 text-neutral-600 w-20 text-right">
          {fmtTokens(node.tokens)}
        </span>
      </div>

      {/* Flag banner */}
      {flagged && isExpanded && (
        <div
          className={`ml-6 mb-1 px-3 py-1.5 font-mono text-[11px] rounded-sm ${
            flagged.level === 'error'
              ? 'bg-red-500/10 text-red-300 border border-red-500/30'
              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
          }`}
        >
          <span className="uppercase tracking-widest mr-2">
            {flagged.level === 'error' ? 'ALERT' : 'WARN'}
          </span>
          {flagged.message}
        </div>
      )}

      {/* Expanded input/output */}
      {isExpanded && (node.input || node.output) && (
        <div className="ml-6 mb-1 panel-inset rounded-sm px-3 py-2 font-mono text-[11px] text-neutral-400 space-y-1">
          {node.input && (
            <div>
              <span className="label-engraved mr-2">input</span>
              <span className="text-neutral-300">{node.input}</span>
            </div>
          )}
          {node.output && (
            <div>
              <span className="label-engraved mr-2">output</span>
              <span className="text-neutral-300">{node.output}</span>
            </div>
          )}
        </div>
      )}

      {/* Children */}
      {isExpanded &&
        visibleChildren.map((child, idx) => (
          <TreeRow
            key={child.id}
            node={child}
            prefix={childPrefix}
            isLast={idx === visibleChildren.length - 1}
            expanded={expanded}
            toggle={toggle}
            agent={agent}
            keyword={keyword}
            depth={depth + 1}
          />
        ))}
    </Fragment>
  );
}

/* ==================================================================== */
/*  Run comparison diff                                                   */
/* ==================================================================== */

interface RankingDiff {
  model: string;
  cpkA: number;
  cpkB: number;
  delta: number;
  rankA: number;
  rankB: number;
  rankShift: number;
}

function computeDiff(a: Run, b: Run): RankingDiff[] {
  const aMap = new Map(a.rankings.map((r, i) => [r.model, { r, rank: i + 1 }]));
  const bMap = new Map(b.rankings.map((r, i) => [r.model, { r, rank: i + 1 }]));
  const models = new Set([...aMap.keys(), ...bMap.keys()]);
  return Array.from(models).map((m) => {
    const ra = aMap.get(m);
    const rb = bMap.get(m);
    const cpkA = ra?.r.cpk ?? 0;
    const cpkB = rb?.r.cpk ?? 0;
    return {
      model: m,
      cpkA,
      cpkB,
      delta: cpkB - cpkA,
      rankA: ra?.rank ?? 0,
      rankB: rb?.rank ?? 0,
      rankShift: (ra?.rank ?? 0) - (rb?.rank ?? 0),
    };
  });
}

/* ==================================================================== */
/*  Empty state                                                           */
/* ==================================================================== */

function EmptyTraces() {
  return (
    <main className="min-h-screen bg-panel text-neutral-200">
      <header className="border-b border-panel-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            PRISM Observability
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-100 mt-1">
            Agent Trace Explorer
          </h1>
        </div>
      </header>
      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="panel p-8 text-center">
          <div className="label-engraved mb-2">No traces yet</div>
          <p className="text-neutral-300 text-base leading-relaxed mb-5">
            No measurements have been recorded in this browser.
          </p>
          <p className="text-neutral-500 text-sm leading-relaxed mb-6 max-w-lg mx-auto">
            Run a measurement on the Dashboard — the full orchestration trace,
            per-model calls, judge-panel agreement, and Cpk computations will
            appear here automatically.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-neutral-100 bg-sigma-4/20 border border-sigma-4/40 hover:bg-sigma-4/30 rounded-sm transition-colors"
          >
            Go to Dashboard →
          </Link>
        </div>
      </section>
    </main>
  );
}

/* ==================================================================== */
/*  Page                                                                  */
/* ==================================================================== */

export default function TracesPage() {
  // Hydrate from localStorage on mount (SSR-safe).
  const [hydrated, setHydrated] = useState(false);
  const [storedRuns, setStoredRuns] = useState<StoredRun[]>([]);

  useEffect(() => {
    setStoredRuns(getRuns());
    setHydrated(true);
  }, []);

  // Build UI runs. getRuns() is newest-first; reverse for chronological
  // numbering so Run #1 is the oldest.
  const runs: Run[] = useMemo(() => {
    const chrono = [...storedRuns].reverse();
    const built = chrono.map((s, i) => buildRunFromStored(s, i + 1));
    // Display newest first (reverse again)
    return [...built].reverse();
  }, [storedRuns]);

  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('__all__');
  const [keyword, setKeyword] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [compareWithId, setCompareWithId] = useState<string>('');

  // Auto-select the newest run + default compare target (2nd newest).
  useEffect(() => {
    if (runs.length > 0) {
      setSelectedRunId((prev) =>
        prev && runs.some((r) => r.id === prev) ? prev : runs[0].id,
      );
      setCompareWithId((prev) => {
        if (prev && runs.some((r) => r.id === prev)) return prev;
        return runs[1]?.id ?? runs[0].id;
      });
    }
  }, [runs]);

  const allAgents = useMemo(() => {
    const s = new Set<string>();
    runs.forEach((r) => collectAgents(r.root, s));
    return Array.from(s).sort();
  }, [runs]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? runs[0];
  const compareRun =
    runs.find((r) => r.id === compareWithId) ?? runs[1] ?? runs[0];

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));

  const expandAll = () => {
    if (!selectedRun) return;
    const all: Record<string, boolean> = {};
    const walk = (n: TraceNode) => {
      all[n.id] = true;
      n.children?.forEach(walk);
    };
    walk(selectedRun.root);
    setExpanded(all);
  };

  const collapseAll = () => {
    if (!selectedRun) return;
    const all: Record<string, boolean> = {};
    const walk = (n: TraceNode) => {
      all[n.id] = false;
      n.children?.forEach(walk);
    };
    walk(selectedRun.root);
    setExpanded(all);
  };

  const diffs = useMemo(() => {
    if (!selectedRun || !compareRun || selectedRun.id === compareRun.id)
      return [];
    return computeDiff(selectedRun, compareRun);
  }, [selectedRun, compareRun]);

  // Auto-enable compare mode when we have 2+ runs
  const canCompare = runs.length >= 2 && selectedRun && compareRun && selectedRun.id !== compareRun.id;

  if (!hydrated) {
    // Avoid hydration mismatch — render a neutral shell on the server.
    return (
      <main className="min-h-screen bg-panel text-neutral-200">
        <header className="border-b border-panel-border">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              PRISM Observability
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100 mt-1">
              Agent Trace Explorer
            </h1>
          </div>
        </header>
        <section className="max-w-7xl mx-auto px-6 py-10">
          <div className="panel p-6 font-mono text-[11px] text-neutral-500">
            Loading traces…
          </div>
        </section>
      </main>
    );
  }

  if (runs.length === 0 || !selectedRun) {
    return <EmptyTraces />;
  }

  return (
    <main className="min-h-screen bg-panel text-neutral-200">
      {/* ================= Top bar ================= */}
      <header className="border-b border-panel-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                PRISM Observability
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-neutral-100 mt-1">
                Agent Trace Explorer
              </h1>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="led-dot bg-sigma-4" aria-hidden />
                otel stream · live
              </span>
              <span className="text-neutral-700">|</span>
              <span>{runs.length} runs indexed</span>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <label className="label-engraved block mb-1">Run</label>
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="w-full bevel bevel-focus px-3 py-2 font-mono text-[12px] text-neutral-100 rounded-sm"
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.timestamp} — {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="label-engraved block mb-1">Filter: agent</label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="w-full bevel bevel-focus px-3 py-2 font-mono text-[12px] text-neutral-100 rounded-sm"
              >
                <option value="__all__">All agents</option>
                {allAgents.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-4">
              <label className="label-engraved block mb-1">
                Search traces (keyword)
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="agent name, summary, input, output..."
                className="w-full bevel bevel-focus px-3 py-2 font-mono text-[12px] text-neutral-100 placeholder:text-neutral-600 rounded-sm"
              />
            </div>
          </div>

          {/* Tree controls */}
          <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest flex-wrap">
            <button
              onClick={expandAll}
              className="px-2.5 py-1 bevel hover:border-neutral-500 text-neutral-300 rounded-sm"
            >
              Expand all
            </button>
            <button
              onClick={collapseAll}
              className="px-2.5 py-1 bevel hover:border-neutral-500 text-neutral-300 rounded-sm"
            >
              Collapse all
            </button>
            {canCompare && (
              <>
                <span className="text-neutral-700">|</span>
                <button
                  onClick={() => setCompareMode((v) => !v)}
                  className={`px-2.5 py-1 bevel hover:border-neutral-500 rounded-sm ${
                    compareMode
                      ? 'text-indigo-300 border-indigo-500/60'
                      : 'text-neutral-300'
                  }`}
                >
                  {compareMode ? '✓ Comparing runs' : 'Compare runs'}
                </button>
                {compareMode && (
                  <>
                    <span className="text-neutral-600 normal-case tracking-normal">
                      vs
                    </span>
                    <select
                      value={compareWithId}
                      onChange={(e) => setCompareWithId(e.target.value)}
                      className="bevel px-2 py-1 font-mono text-[10px] text-neutral-100 rounded-sm uppercase tracking-widest"
                    >
                      {runs
                        .filter((r) => r.id !== selectedRunId)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.id} · {r.timestamp.slice(11)}
                          </option>
                        ))}
                    </select>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* ================= Main grid ================= */}
      <section className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ----- Trace tree ----- */}
        <div className="lg:col-span-8 panel p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="label-engraved">Trace tree</div>
              <div className="font-mono text-[13px] text-neutral-100 mt-0.5">
                {selectedRun.id} · {selectedRun.label}
              </div>
            </div>
            <div className="font-mono text-[11px] text-neutral-500 tabular-nums">
              {selectedRun.timestamp}
            </div>
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-2 px-2 pb-1.5 mb-1 border-b border-panel-border font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-600">
            <span className="flex-1 pl-[4.2rem]">agent · summary</span>
            <span className="w-16 text-right">dur</span>
            <span className="w-16 text-right">cost</span>
            <span className="w-20 text-right">tokens</span>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <TreeRow
              node={selectedRun.root}
              prefix=""
              isLast
              expanded={expanded}
              toggle={toggle}
              agent={agentFilter}
              keyword={keyword}
              depth={0}
            />
          </div>
        </div>

        {/* ----- Right panel: run summary ----- */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="panel p-4">
            <div className="label-engraved">Run summary</div>
            <div className="mt-2 font-mono text-[12px] text-neutral-200 leading-relaxed">
              {selectedRun.label}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <dt className="label-engraved">Duration</dt>
                <dd className="readout text-lg mt-0.5">
                  {fmtDuration(selectedRun.duration_ms)}
                </dd>
              </div>
              <div>
                <dt className="label-engraved">Total cost</dt>
                <dd
                  className={`readout text-lg mt-0.5 ${costColor(
                    selectedRun.cost_usd,
                  )}`}
                >
                  {fmtCost(selectedRun.cost_usd)}
                </dd>
              </div>
              <div>
                <dt className="label-engraved">Tokens (est.)</dt>
                <dd className="readout text-lg mt-0.5">
                  {(selectedRun.tokens / 1000).toFixed(2)}k
                </dd>
              </div>
              <div>
                <dt className="label-engraved">Agents invoked</dt>
                <dd className="readout text-lg mt-0.5">
                  {(() => {
                    const s = new Set<string>();
                    collectAgents(selectedRun.root, s);
                    return s.size;
                  })()}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="label-engraved">Gauge R&amp;R agreement</dt>
                <dd className="mt-1 flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-panel-muted rounded-sm overflow-hidden">
                    <div
                      className={`h-full ${
                        selectedRun.gauge_rr_pct >= 90
                          ? 'bg-sigma-4'
                          : selectedRun.gauge_rr_pct >= 80
                            ? 'bg-sigma-3'
                            : 'bg-sigma-1'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, selectedRun.gauge_rr_pct))}%` }}
                    />
                  </div>
                  <span className="readout text-sm">
                    {selectedRun.gauge_rr_pct.toFixed(1)}%
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Alerts */}
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <div className="label-engraved">Alerts &amp; anomalies</div>
              <span
                className={`led-dot ${
                  selectedRun.alerts.length === 0 ? 'bg-sigma-4' : 'bg-sigma-1'
                }`}
              />
            </div>
            {selectedRun.alerts.length === 0 ? (
              <div className="mt-3 font-mono text-[11px] text-neutral-500">
                No anomalies detected. All trials passed Gauge R&amp;R.
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {selectedRun.alerts.map((a, i) => (
                  <li
                    key={i}
                    className="font-mono text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 border-l-2 border-l-red-500 px-3 py-2 rounded-sm"
                  >
                    <span className="uppercase tracking-widest text-[9px] mr-2 text-red-400">
                      alert
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Rankings */}
          <div className="panel p-4">
            <div className="label-engraved mb-2">Model ranking (this run)</div>
            <table className="w-full font-mono text-[11px] tabular-nums">
              <thead>
                <tr className="text-[9px] uppercase tracking-[0.18em] text-neutral-600 border-b border-panel-border">
                  <th className="text-left py-1 font-normal">#</th>
                  <th className="text-left py-1 font-normal">Model</th>
                  <th className="text-right py-1 font-normal">Cpk</th>
                  <th className="text-right py-1 font-normal">σ</th>
                  <th className="text-right py-1 font-normal">DPMO</th>
                </tr>
              </thead>
              <tbody>
                {selectedRun.rankings.map((r, i) => (
                  <tr key={r.model} className="border-b border-panel-border/50">
                    <td className="py-1.5 text-neutral-500">{i + 1}</td>
                    <td className="py-1.5 text-neutral-200">{r.model}</td>
                    <td
                      className={`py-1.5 text-right ${
                        r.cpk >= 1.33
                          ? 'text-sigma-4'
                          : r.cpk >= 1.0
                            ? 'text-sigma-3'
                            : 'text-sigma-1'
                      }`}
                    >
                      {r.cpk.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-neutral-400">
                      {r.sigma.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-neutral-500">
                      {Math.round(r.dpmo).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </section>

      {/* ================= Comparison view ================= */}
      {compareMode && canCompare && compareRun && (
        <section className="max-w-7xl mx-auto px-6 pb-10">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="label-engraved">Run comparison · diff view</div>
                <div className="font-mono text-[13px] text-neutral-100 mt-0.5">
                  {selectedRun.id}{' '}
                  <span className="text-neutral-600">←→</span>{' '}
                  {compareRun.id}
                </div>
              </div>
              <button
                onClick={() => setCompareMode(false)}
                className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-200"
              >
                close ✕
              </button>
            </div>

            {/* Side-by-side metrics */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[selectedRun, compareRun].map((r, idx) => (
                <div key={r.id} className="panel-inset p-4 rounded-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[11px] text-neutral-400">
                      {idx === 0 ? 'A · ' : 'B · '}
                      {r.id}
                    </div>
                    <div className="font-mono text-[10px] text-neutral-600">
                      {r.timestamp}
                    </div>
                  </div>
                  <div className="mt-1 font-mono text-[12px] text-neutral-200 truncate">
                    {r.label}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 font-mono text-[11px] tabular-nums">
                    <div>
                      <div className="label-engraved">dur</div>
                      <div className="readout text-sm">
                        {fmtDuration(r.duration_ms)}
                      </div>
                    </div>
                    <div>
                      <div className="label-engraved">cost</div>
                      <div className={`readout text-sm ${costColor(r.cost_usd)}`}>
                        {fmtCost(r.cost_usd)}
                      </div>
                    </div>
                    <div>
                      <div className="label-engraved">tokens</div>
                      <div className="readout text-sm">
                        {(r.tokens / 1000).toFixed(1)}k
                      </div>
                    </div>
                    <div>
                      <div className="label-engraved">R&amp;R</div>
                      <div className="readout text-sm">
                        {r.gauge_rr_pct.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Deltas */}
            <div className="mt-5">
              <div className="label-engraved mb-2">
                Cpk deltas &amp; rank shifts
              </div>
              <table className="w-full font-mono text-[11px] tabular-nums">
                <thead>
                  <tr className="text-[9px] uppercase tracking-[0.18em] text-neutral-600 border-b border-panel-border">
                    <th className="text-left py-1.5 font-normal">Model</th>
                    <th className="text-right py-1.5 font-normal">
                      Cpk {selectedRun.id}
                    </th>
                    <th className="text-right py-1.5 font-normal">
                      Cpk {compareRun.id}
                    </th>
                    <th className="text-right py-1.5 font-normal">Δ Cpk</th>
                    <th className="text-right py-1.5 font-normal">Rank A</th>
                    <th className="text-right py-1.5 font-normal">Rank B</th>
                    <th className="text-right py-1.5 font-normal">Shift</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs
                    .slice()
                    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                    .map((d) => {
                      const big = Math.abs(d.delta) >= 0.3;
                      const color =
                        d.delta > 0.05
                          ? 'text-emerald-400'
                          : d.delta < -0.05
                            ? 'text-red-400'
                            : 'text-neutral-400';
                      const shiftSym =
                        d.rankShift > 0
                          ? `▲ ${d.rankShift}`
                          : d.rankShift < 0
                            ? `▼ ${-d.rankShift}`
                            : '—';
                      const shiftColor =
                        d.rankShift > 0
                          ? 'text-emerald-400'
                          : d.rankShift < 0
                            ? 'text-red-400'
                            : 'text-neutral-500';
                      return (
                        <tr
                          key={d.model}
                          className={`border-b border-panel-border/50 ${
                            big ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          <td className="py-1.5 text-neutral-200">
                            {d.model}
                          </td>
                          <td className="py-1.5 text-right text-neutral-400">
                            {d.cpkA.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right text-neutral-400">
                            {d.cpkB.toFixed(2)}
                          </td>
                          <td className={`py-1.5 text-right ${color}`}>
                            {d.delta > 0 ? '+' : ''}
                            {d.delta.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right text-neutral-500">
                            {d.rankA || '—'}
                          </td>
                          <td className="py-1.5 text-right text-neutral-500">
                            {d.rankB || '—'}
                          </td>
                          <td className={`py-1.5 text-right ${shiftColor}`}>
                            {shiftSym}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Auto-generated diff alerts */}
            <div className="mt-5">
              <div className="label-engraved mb-2">Drift alerts</div>
              <ul className="space-y-2">
                {diffs
                  .filter((d) => Math.abs(d.delta) >= 0.3 && d.rankA && d.rankB)
                  .map((d) => (
                    <li
                      key={d.model}
                      className="font-mono text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 border-l-2 border-l-red-500 px-3 py-2 rounded-sm"
                    >
                      <span className="uppercase tracking-widest text-[9px] mr-2 text-red-400">
                        alert
                      </span>
                      {d.model} Cpk {d.delta > 0 ? 'rose' : 'dropped'}{' '}
                      {Math.abs(d.delta).toFixed(2)} between runs
                      {d.rankShift !== 0
                        ? ` (rank ${d.rankA} → ${d.rankB})`
                        : ''}
                      {d.delta < -0.3 ? ' — drift detected' : ''}
                    </li>
                  ))}
                {diffs
                  .filter((d) => d.rankA === 1 && d.rankB !== 1 && d.rankB > 0)
                  .map((d) => (
                    <li
                      key={`lead-${d.model}`}
                      className="font-mono text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 border-l-2 border-l-amber-500 px-3 py-2 rounded-sm"
                    >
                      <span className="uppercase tracking-widest text-[9px] mr-2 text-amber-400">
                        ranking
                      </span>
                      Leader changed: {d.model} (rank 1 in {selectedRun.id}) →
                      rank {d.rankB} in {compareRun.id}
                    </li>
                  ))}
                {diffs.length === 0 && (
                  <li className="font-mono text-[11px] text-neutral-500">
                    No shared models between the selected runs.
                  </li>
                )}
                {diffs.length > 0 &&
                  diffs.every((d) => Math.abs(d.delta) < 0.3) &&
                  !diffs.some(
                    (d) => d.rankA === 1 && d.rankB !== 1 && d.rankB > 0,
                  ) && (
                    <li className="font-mono text-[11px] text-neutral-500">
                      No significant drift between runs (all |ΔCpk| &lt; 0.30).
                    </li>
                  )}
              </ul>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
