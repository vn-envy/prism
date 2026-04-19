'use client';

import { useMemo, useState, Fragment } from 'react';

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
/*  Simulated runs                                                        */
/* ==================================================================== */

// Helper: build a trial subtree with slight variations.
function buildTrial(
  i: number,
  dur: number,
  cost: number,
  execCosts: number[],
  execTokens: number[],
  judgeScores: number[][],
  sigma: number,
  flag?: { level: 'warn' | 'error'; message: string },
): TraceNode {
  const models = [
    'qwen-72b',
    'sarvam-m-24b',
    'deepseek-v3',
    'llama-3.3-70b',
    'command-r-plus',
  ];
  const testCost = 0.006 + i * 0.0004;
  const execSum = execCosts.reduce((a, b) => a + b, 0);
  const judgeCost = cost - testCost - execSum;
  return {
    id: `trial_${i}`,
    agent: `trial_${i}`,
    kind: 'agent',
    duration_ms: dur,
    cost_usd: cost,
    tokens: execTokens.reduce((a, b) => a + b, 0) + 580,
    summary: `Trial ${i} — generate, execute, judge`,
    flag,
    children: [
      {
        id: `trial_${i}_testgen`,
        agent: 'test_generator',
        kind: 'model_call',
        duration_ms: 380 + i * 10,
        cost_usd: testCost,
        tokens: 540 + i * 8,
        summary: 'claude-sonnet → generated structured_output test case',
        input: 'Generate a test case for Hindi JSON extraction from kirana SMS.',
        output:
          'Test: parse "₹250 चावल 5kg, ₹80 दाल 2kg" → [{item:"चावल",qty:"5kg",price:250},{item:"दाल",qty:"2kg",price:80}]',
      },
      {
        id: `trial_${i}_exec`,
        agent: 'candidate_execution',
        kind: 'parallel_group',
        duration_ms: 480 + i * 12,
        cost_usd: execSum,
        tokens: execTokens.reduce((a, b) => a + b, 0),
        summary: 'Parallel execution across 5 candidate models',
        children: models.map((m, idx) => ({
          id: `trial_${i}_exec_${m}`,
          agent: m,
          kind: 'model_call' as const,
          duration_ms: 320 + idx * 40 + i * 6,
          cost_usd: execCosts[idx],
          tokens: execTokens[idx],
          summary: `${m} → returned parsed JSON (${execTokens[idx]} tok)`,
          input:
            'Parse "₹250 चावल 5kg, ₹80 दाल 2kg" into structured JSON.',
          output:
            idx === 1
              ? '{"items":[{"item":"चावल","qty":"5kg","price":250},{"item":"दाल","qty":"2kg","price":80}]}'
              : idx === 4
                ? '[{"item":"rice","qty":"5kg","price":250},{"item":"dal","qty":"2kg","price":80}]'
                : '[{"item":"चावल","qty":"5kg","price":250},{"item":"दाल","qty":"2kg","price":80}]',
        })),
      },
      {
        id: `trial_${i}_judge`,
        agent: 'judge_panel',
        kind: 'judge',
        duration_ms: 780 + i * 15,
        cost_usd: judgeCost,
        tokens: 1240 + i * 22,
        summary: `Gauge R&R — inter-judge σ = ${sigma.toFixed(1)} ${sigma < 5 ? '✓' : '⚠'}`,
        flag,
        children: [
          {
            id: `trial_${i}_judge_opus`,
            agent: 'claude-opus',
            kind: 'model_call',
            duration_ms: 260,
            cost_usd: judgeCost * 0.42,
            tokens: 420,
            summary: `scores: [${judgeScores[0].join(', ')}]`,
          },
          {
            id: `trial_${i}_judge_gpt`,
            agent: 'gpt-4o',
            kind: 'model_call',
            duration_ms: 240,
            cost_usd: judgeCost * 0.32,
            tokens: 412,
            summary: `scores: [${judgeScores[1].join(', ')}]`,
          },
          {
            id: `trial_${i}_judge_gemini`,
            agent: 'gemini-2.5',
            kind: 'model_call',
            duration_ms: 280,
            cost_usd: judgeCost * 0.26,
            tokens: 408,
            summary: `scores: [${judgeScores[2].join(', ')}]`,
          },
        ],
      },
    ],
  };
}

const RUN_1: Run = {
  id: 'run_1',
  label: 'Hindi JSON extraction for kirana inventory',
  intent:
    'I want to build a Hindi WhatsApp bot for kirana stores that parses SMS into a JSON inventory.',
  timestamp: '2026-04-19 09:12:04',
  duration_ms: 4200,
  cost_usd: 0.145,
  tokens: 24810,
  gauge_rr_pct: 94.2,
  alerts: [],
  rankings: [
    { model: 'qwen-72b', cpk: 1.47, sigma: 4.4, dpmo: 6210 },
    { model: 'sarvam-m-24b', cpk: 1.41, sigma: 4.2, dpmo: 8140 },
    { model: 'deepseek-v3', cpk: 1.28, sigma: 3.8, dpmo: 14200 },
    { model: 'llama-3.3-70b', cpk: 1.18, sigma: 3.5, dpmo: 22800 },
    { model: 'command-r-plus', cpk: 1.34, sigma: 4.0, dpmo: 11500 },
  ],
  root: {
    id: 'orchestrator',
    agent: 'orchestrator (autoresearch)',
    kind: 'orchestrator',
    duration_ms: 4200,
    cost_usd: 0.145,
    tokens: 24810,
    summary: 'End-to-end measurement pipeline, 5 trials, Gauge R&R validated',
    children: [
      {
        id: 'voc',
        agent: 'voc_parser',
        kind: 'agent',
        duration_ms: 300,
        cost_usd: 0.008,
        tokens: 342,
        summary: 'VoC → CTQ: parsed intent to CTQ specs',
        input:
          'I want to build a Hindi WhatsApp bot for kirana stores that parses SMS into a JSON inventory.',
        output:
          'CTQs: [lang=hi, format=json_strict, domain=retail_pos, latency_budget=2s, lsl_score=70]',
      },
      {
        id: 'filter',
        agent: 'candidate_filter',
        kind: 'agent',
        duration_ms: 110,
        cost_usd: 0,
        tokens: 0,
        summary:
          'Selected: Qwen 72B, Sarvam-M 24B, DeepSeek V3, Llama 3.3, Command R+',
        input: 'CTQs + provider registry (43 models)',
        output:
          'Filtered to 5 candidates meeting lang=hi and format=json_strict support.',
      },
      buildTrial(
        1,
        1200,
        0.032,
        [0.008, 0.006, 0.009, 0.005, 0.004],
        [892, 654, 1102, 789, 945],
        [
          [87, 82, 91, 85],
          [85, 80, 88, 83],
          [86, 81, 90, 84],
        ],
        3.2,
      ),
      buildTrial(
        2,
        1100,
        0.03,
        [0.0075, 0.0055, 0.0085, 0.0048, 0.0042],
        [870, 640, 1088, 770, 930],
        [
          [88, 83, 90, 86],
          [86, 81, 89, 84],
          [87, 82, 91, 85],
        ],
        2.8,
      ),
      buildTrial(
        3,
        1000,
        0.028,
        [0.007, 0.0052, 0.008, 0.0045, 0.004],
        [860, 632, 1070, 760, 918],
        [
          [89, 84, 91, 87],
          [87, 82, 90, 85],
          [88, 83, 92, 86],
        ],
        2.1,
      ),
      buildTrial(
        4,
        1200,
        0.031,
        [0.0078, 0.0058, 0.0088, 0.005, 0.0041],
        [884, 648, 1094, 780, 938],
        [
          [86, 81, 90, 85],
          [85, 80, 89, 84],
          [86, 82, 91, 85],
        ],
        3.5,
      ),
      buildTrial(
        5,
        1100,
        0.029,
        [0.0072, 0.0054, 0.0082, 0.0046, 0.0041],
        [878, 642, 1080, 774, 924],
        [
          [88, 82, 91, 86],
          [86, 81, 90, 85],
          [87, 82, 91, 86],
        ],
        2.6,
      ),
      {
        id: 'cpk',
        agent: 'cpk_calculator',
        kind: 'compute',
        duration_ms: 50,
        cost_usd: 0,
        tokens: 0,
        summary:
          'Computed: Cpk, DPMO, σ-level per model. Qwen 72B leads (Cpk=1.47).',
        output:
          'Qwen: Cpk=1.47 σ=4.4 | Sarvam: 1.41/4.2 | DeepSeek: 1.28/3.8 | Llama: 1.18/3.5 | Cmd R+: 1.34/4.0',
      },
    ],
  },
};

const RUN_2: Run = {
  id: 'run_2',
  label: 'Tamil voice transcription (Whisper-class)',
  intent:
    'Tamil customer-support voice-to-text: need accuracy > 85% on noisy call-center audio.',
  timestamp: '2026-04-19 10:47:52',
  duration_ms: 5100,
  cost_usd: 0.172,
  tokens: 27340,
  gauge_rr_pct: 82.6,
  alerts: [
    'Trial 3: judge disagreement σ=22.1 — re-run triggered',
    'Elevated judge variance on Command R+ output (flagged as ambiguous)',
  ],
  rankings: [
    { model: 'qwen-72b', cpk: 1.32, sigma: 4.0, dpmo: 11800 },
    { model: 'sarvam-m-24b', cpk: 1.52, sigma: 4.6, dpmo: 4180 },
    { model: 'deepseek-v3', cpk: 1.21, sigma: 3.6, dpmo: 17900 },
    { model: 'llama-3.3-70b', cpk: 1.14, sigma: 3.4, dpmo: 27400 },
    { model: 'command-r-plus', cpk: 1.09, sigma: 3.3, dpmo: 31200 },
  ],
  root: {
    id: 'orchestrator',
    agent: 'orchestrator (autoresearch)',
    kind: 'orchestrator',
    duration_ms: 5100,
    cost_usd: 0.172,
    tokens: 27340,
    summary:
      'End-to-end measurement, Trial 3 re-run after judge σ spike (22.1)',
    children: [
      {
        id: 'voc',
        agent: 'voc_parser',
        kind: 'agent',
        duration_ms: 320,
        cost_usd: 0.009,
        tokens: 358,
        summary: 'VoC → CTQ: Tamil ASR, noisy audio, accuracy-critical',
        input:
          'Tamil customer-support voice-to-text: need accuracy > 85% on noisy call-center audio.',
        output:
          'CTQs: [lang=ta, modality=audio, noise_floor=dirty, lsl_wer=15, lsl_score=85]',
      },
      {
        id: 'filter',
        agent: 'candidate_filter',
        kind: 'agent',
        duration_ms: 120,
        cost_usd: 0,
        tokens: 0,
        summary:
          'Selected: Qwen 72B, Sarvam-M 24B, DeepSeek V3, Llama 3.3, Command R+',
        output: 'Same 5-model candidate set (Tamil support verified).',
      },
      buildTrial(
        1,
        1240,
        0.034,
        [0.0085, 0.0062, 0.0092, 0.0054, 0.0047],
        [904, 668, 1112, 798, 954],
        [
          [84, 88, 82, 79],
          [83, 87, 81, 78],
          [85, 89, 82, 80],
        ],
        3.4,
      ),
      buildTrial(
        2,
        1180,
        0.033,
        [0.0082, 0.006, 0.009, 0.0052, 0.0046],
        [898, 660, 1104, 790, 946],
        [
          [85, 89, 82, 80],
          [84, 88, 81, 79],
          [86, 90, 83, 81],
        ],
        2.9,
      ),
      buildTrial(
        3,
        1320,
        0.038,
        [0.0088, 0.0065, 0.0098, 0.0058, 0.0051],
        [912, 676, 1122, 808, 964],
        [
          [68, 91, 74, 52],
          [88, 72, 83, 95],
          [79, 84, 69, 71],
        ],
        22.1,
        {
          level: 'error',
          message:
            'Judge σ=22.1 exceeds threshold (σ>10). Measurement invalid — re-run triggered.',
        },
      ),
      buildTrial(
        4,
        1200,
        0.032,
        [0.0078, 0.0058, 0.0088, 0.005, 0.0043],
        [890, 650, 1096, 782, 940],
        [
          [85, 90, 83, 80],
          [84, 89, 82, 79],
          [85, 90, 83, 81],
        ],
        3.1,
      ),
      buildTrial(
        5,
        1140,
        0.031,
        [0.0075, 0.0056, 0.0086, 0.0048, 0.0042],
        [882, 642, 1086, 774, 932],
        [
          [86, 91, 84, 81],
          [85, 90, 83, 80],
          [86, 91, 84, 82],
        ],
        2.5,
      ),
      {
        id: 'cpk',
        agent: 'cpk_calculator',
        kind: 'compute',
        duration_ms: 55,
        cost_usd: 0,
        tokens: 0,
        summary:
          'Computed: Sarvam-M 24B leads (Cpk=1.52) — specialized Indic ASR.',
        output:
          'Sarvam: 1.52/4.6 | Qwen: 1.32/4.0 | DeepSeek: 1.21/3.6 | Llama: 1.14/3.4 | Cmd R+: 1.09/3.3',
      },
    ],
  },
};

const RUN_3: Run = {
  id: 'run_3',
  label: 'Hindi JSON extraction — re-measurement (7 days later)',
  intent:
    'I want to build a Hindi WhatsApp bot for kirana stores that parses SMS into a JSON inventory.',
  timestamp: '2026-04-19 14:08:31',
  duration_ms: 4050,
  cost_usd: 0.141,
  tokens: 24360,
  gauge_rr_pct: 93.8,
  alerts: [
    'Drift detected: Command R+ Cpk dropped 1.34 → 0.93 vs Run #1',
  ],
  rankings: [
    { model: 'sarvam-m-24b', cpk: 1.49, sigma: 4.5, dpmo: 5210 },
    { model: 'qwen-72b', cpk: 1.44, sigma: 4.3, dpmo: 7180 },
    { model: 'deepseek-v3', cpk: 1.31, sigma: 3.9, dpmo: 12800 },
    { model: 'llama-3.3-70b', cpk: 1.19, sigma: 3.5, dpmo: 22100 },
    { model: 'command-r-plus', cpk: 0.93, sigma: 2.9, dpmo: 51400 },
  ],
  root: {
    id: 'orchestrator',
    agent: 'orchestrator (autoresearch)',
    kind: 'orchestrator',
    duration_ms: 4050,
    cost_usd: 0.141,
    tokens: 24360,
    summary:
      'Same intent as Run #1 — ranking shift: Sarvam overtakes Qwen, Cmd R+ fails Cpk bar',
    children: [
      {
        id: 'voc',
        agent: 'voc_parser',
        kind: 'agent',
        duration_ms: 290,
        cost_usd: 0.008,
        tokens: 340,
        summary: 'VoC → CTQ: identical spec to Run #1',
        output:
          'CTQs: [lang=hi, format=json_strict, domain=retail_pos, latency_budget=2s, lsl_score=70]',
      },
      {
        id: 'filter',
        agent: 'candidate_filter',
        kind: 'agent',
        duration_ms: 105,
        cost_usd: 0,
        tokens: 0,
        summary:
          'Selected: Qwen 72B, Sarvam-M 24B, DeepSeek V3, Llama 3.3, Command R+',
      },
      buildTrial(
        1,
        1180,
        0.031,
        [0.0078, 0.0062, 0.0088, 0.0048, 0.0042],
        [880, 672, 1094, 774, 936],
        [
          [86, 88, 90, 72],
          [85, 87, 89, 70],
          [86, 88, 91, 71],
        ],
        2.9,
      ),
      buildTrial(
        2,
        1080,
        0.029,
        [0.0072, 0.0058, 0.0082, 0.0046, 0.004],
        [864, 660, 1082, 764, 924],
        [
          [87, 89, 90, 68],
          [86, 88, 89, 66],
          [87, 89, 91, 69],
        ],
        2.4,
        {
          level: 'warn',
          message:
            'Command R+ output drifted: JSON key translation now inconsistent (70% → 48%).',
        },
      ),
      buildTrial(
        3,
        980,
        0.027,
        [0.0068, 0.0055, 0.0078, 0.0044, 0.0038],
        [854, 650, 1066, 756, 914],
        [
          [88, 90, 92, 65],
          [87, 89, 91, 64],
          [88, 90, 92, 66],
        ],
        1.9,
      ),
      buildTrial(
        4,
        1160,
        0.03,
        [0.0075, 0.006, 0.0085, 0.0047, 0.0041],
        [872, 666, 1088, 770, 930],
        [
          [85, 88, 90, 70],
          [84, 87, 89, 68],
          [86, 88, 90, 71],
        ],
        3.1,
      ),
      buildTrial(
        5,
        1060,
        0.028,
        [0.007, 0.0056, 0.008, 0.0045, 0.0039],
        [860, 656, 1076, 762, 920],
        [
          [87, 89, 91, 67],
          [86, 88, 90, 66],
          [87, 89, 91, 68],
        ],
        2.5,
      ),
      {
        id: 'cpk',
        agent: 'cpk_calculator',
        kind: 'compute',
        duration_ms: 48,
        cost_usd: 0,
        tokens: 0,
        summary:
          'Re-computed: Sarvam-M overtakes Qwen; Cmd R+ fails Cpk ≥ 1.0 gate.',
        output:
          'Sarvam: 1.49/4.5 | Qwen: 1.44/4.3 | DeepSeek: 1.31/3.9 | Llama: 1.19/3.5 | Cmd R+: 0.93/2.9 ⚠',
      },
    ],
  },
};

const RUNS: Run[] = [RUN_1, RUN_2, RUN_3];

/* ==================================================================== */
/*  Formatting helpers                                                    */
/* ==================================================================== */

function fmtDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
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

        {/* Duration / cost / tokens (right-aligned stats) */}
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
/*  Page                                                                  */
/* ==================================================================== */

export default function TracesPage() {
  const [selectedRunId, setSelectedRunId] = useState<string>(RUNS[0].id);
  const [agentFilter, setAgentFilter] = useState<string>('__all__');
  const [keyword, setKeyword] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [compareWithId, setCompareWithId] = useState<string>(RUNS[2].id);

  const selectedRun = RUNS.find((r) => r.id === selectedRunId) ?? RUNS[0];
  const compareRun = RUNS.find((r) => r.id === compareWithId) ?? RUNS[2];

  const allAgents = useMemo(() => {
    const s = new Set<string>();
    RUNS.forEach((r) => collectAgents(r.root, s));
    return Array.from(s).sort();
  }, []);

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    const walk = (n: TraceNode) => {
      all[n.id] = true;
      n.children?.forEach(walk);
    };
    walk(selectedRun.root);
    setExpanded(all);
  };

  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    const walk = (n: TraceNode) => {
      all[n.id] = false;
      n.children?.forEach(walk);
    };
    walk(selectedRun.root);
    setExpanded(all);
  };

  const diffs = useMemo(
    () => computeDiff(selectedRun, compareRun),
    [selectedRun, compareRun],
  );

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
              <span>{RUNS.length} runs indexed</span>
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
                {RUNS.map((r) => (
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
          <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
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
                  {RUNS.filter((r) => r.id !== selectedRunId).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} · {r.timestamp.slice(11)}
                    </option>
                  ))}
                </select>
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
                <dt className="label-engraved">Tokens</dt>
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
                      style={{ width: `${selectedRun.gauge_rr_pct}%` }}
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
                      {r.sigma.toFixed(1)}
                    </td>
                    <td className="py-1.5 text-right text-neutral-500">
                      {r.dpmo.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </section>

      {/* ================= Comparison view ================= */}
      {compareMode && (
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
                            {d.rankA}
                          </td>
                          <td className="py-1.5 text-right text-neutral-500">
                            {d.rankB}
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
                  .filter((d) => Math.abs(d.delta) >= 0.3)
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
                  .filter((d) => d.rankA === 1 && d.rankB !== 1)
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
                {diffs.every((d) => Math.abs(d.delta) < 0.3) &&
                  !diffs.some((d) => d.rankA === 1 && d.rankB !== 1) && (
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
