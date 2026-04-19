'use client';

import { useState } from 'react';
import {
  ModelResult,
  cpkTier,
  tierHex,
} from '../lib/types';
import CpkDisplay from './CpkDisplay';
import SigmaBadge from './SigmaBadge';
import ControlChart from './ControlChart';

interface ModelCardProps {
  result: ModelResult;
  lsl: number;
  rank: number;
}

/**
 * The "Nutrition Label" card for a single model.
 * Industrial instrument panel feel — engraved labels, monospace readouts.
 */
export default function ModelCard({ result, lsl, rank }: ModelCardProps) {
  const [showChart, setShowChart] = useState(false);
  const tier = cpkTier(result.cpk);
  const tierColor = tierHex(tier);

  const hwTier = result.hardware_tier
    ? hwTierFromBackend(result.hardware_tier)
    : hardwareTier(result.model_id, result.short_name);
  const paramLabel = result.parameters_b
    ? `${result.parameters_b}B`
    : paramCountLabel(result.model_id, result.short_name);

  return (
    <div
      className="panel flex flex-col"
      style={{ borderTop: `2px solid ${tierColor}` }}
    >
      {/* ---- Header ---- */}
      <div className="px-4 pt-3 pb-3 border-b border-panel-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-neutral-600">
                #{rank}
              </span>
              <h3 className="text-base font-semibold text-neutral-100 truncate">
                {result.short_name}
              </h3>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-neutral-500 truncate">
              {result.model_id}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {paramLabel && (
              <span className="font-mono text-[10px] text-neutral-400 panel-inset px-1.5 py-0.5">
                {paramLabel}
              </span>
            )}
            <span
              className="led-dot"
              style={{ backgroundColor: hwTier.color }}
              title={`Hardware tier: ${hwTier.label}`}
            />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider"
            style={{
              color: tierColor,
              border: `1px solid ${tierColor}`,
            }}
          >
            {result.verdict}
          </span>
          <span className="font-mono text-[10px] text-neutral-500">
            match {result.match_score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* ---- Hero readouts ---- */}
      <div className="px-4 py-3 space-y-2">
        <CpkDisplay cpk={result.cpk} />
        <SigmaBadge
          sigmaLevel={result.sigma_level}
          cpk={result.cpk}
          dpmo={result.dpmo}
        />
      </div>

      {/* ---- Secondary stats: μ, σ ---- */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <StatCell label="μ (mean)" value={result.mu.toFixed(2)} />
        <StatCell label="σ (std dev)" value={result.sigma.toFixed(2)} />
        <StatCell
          label="Gauge R&R"
          value={`${result.gauge_rr_pct.toFixed(1)}%`}
        />
        <StatCell label="LSL" value={lsl.toFixed(0)} />
      </div>

      {/* ---- ASCII distribution ---- */}
      <div className="px-4 pb-3">
        <div className="label-engraved mb-1">Distribution vs LSL</div>
        <pre className="font-mono text-[10px] leading-tight text-neutral-400 panel-inset px-2 py-2 overflow-hidden">
{asciiDistribution(result.mu, result.sigma, lsl)}
        </pre>
      </div>

      {/* ---- Cost / latency tags ---- */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <Tag label="cost" value={`$${result.cost_usd.toFixed(4)}`} />
        <Tag label="latency" value={`${Math.round(result.latency_ms)}ms`} />
      </div>

      {/* ---- Control chart toggle ---- */}
      <div className="mt-auto border-t border-panel-border">
        <button
          type="button"
          onClick={() => setShowChart((s) => !s)}
          className="w-full px-4 py-2 text-left label-engraved hover:bg-panel-muted transition-colors flex items-center justify-between"
        >
          <span>
            {showChart ? '▾ Hide' : '▸ Show'} Control Chart
          </span>
          <span className="font-mono text-[10px] text-neutral-600">
            Shewhart X̄
          </span>
        </button>
        {showChart && (
          <div className="p-3 border-t border-panel-border">
            <ControlChart
              mu={result.mu}
              sigma={result.sigma}
              lsl={result.lsl ?? lsl}
              trialScores={result.trial_scores ?? undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-inset px-2 py-1.5">
      <div className="label-engraved">{label}</div>
      <div className="readout text-sm mt-0.5">{value}</div>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-inset px-2 py-1 flex items-baseline gap-2">
      <span className="label-engraved">{label}</span>
      <span className="readout text-xs text-neutral-200">{value}</span>
    </div>
  );
}

/**
 * A minimal ASCII normal-distribution plot showing where μ sits relative to
 * LSL. The curve is drawn on a 0-100 score axis. LSL marker is '|', the
 * curve body uses '·' / '░' / '▒' density bands. Intended to be read at a
 * glance, not as an exact visualization.
 */
function asciiDistribution(mu: number, sigma: number, lsl: number): string {
  const WIDTH = 48;
  const toCol = (v: number) =>
    Math.max(0, Math.min(WIDTH - 1, Math.round((v / 100) * (WIDTH - 1))));
  const safeSigma = Math.max(sigma, 0.5);

  // Compute a height for each column using a gaussian at that score value.
  const heights: number[] = [];
  for (let c = 0; c < WIDTH; c++) {
    const v = (c / (WIDTH - 1)) * 100;
    const z = (v - mu) / safeSigma;
    heights.push(Math.exp(-0.5 * z * z));
  }
  const max = Math.max(...heights) || 1;
  const norm = heights.map((h) => h / max);

  // Two rows: density band + axis.
  const densityRow = norm
    .map((h) => {
      if (h > 0.85) return '█';
      if (h > 0.55) return '▓';
      if (h > 0.25) return '▒';
      if (h > 0.08) return '░';
      return ' ';
    })
    .join('');

  const axis = Array(WIDTH).fill('─');
  const lslCol = toCol(lsl);
  const muCol = toCol(mu);
  axis[lslCol] = '│';
  const axisStr = axis.join('');

  // Marker row: L for LSL, μ for mean
  const markers = Array(WIDTH).fill(' ');
  markers[lslCol] = 'L';
  if (muCol !== lslCol) markers[muCol] = 'μ';
  const markerStr = markers.join('');

  return `${densityRow}\n${axisStr}\n${markerStr}`;
}

interface HwTier {
  label: string;
  color: string;
}

/**
 * Rough hardware-class heuristic from model id / name. Used only to color an
 * indicator LED on the card — not a judgment on the model's capability.
 *   green  → commodity / edge-deployable
 *   yellow → mid-tier GPU
 *   red    → frontier / datacenter
 */
function hardwareTier(modelId: string, shortName: string): HwTier {
  const id = `${modelId} ${shortName}`.toLowerCase();
  if (/(opus|gpt-4|claude-3-opus|gemini-1\.5-pro|o1|405b|70b)/.test(id)) {
    return { label: 'Frontier / datacenter', color: '#ef4444' };
  }
  if (/(sonnet|mistral-large|mixtral|34b|32b|gpt-4o-mini|haiku)/.test(id)) {
    return { label: 'Mid-tier GPU', color: '#eab308' };
  }
  if (/(phi|gemma|3b|7b|8b|mini|nano|small|flash)/.test(id)) {
    return { label: 'Edge / commodity', color: '#22c55e' };
  }
  return { label: 'Unclassified', color: '#6b7280' };
}

function paramCountLabel(modelId: string, shortName: string): string | null {
  const id = `${modelId} ${shortName}`;
  const m = id.match(/(\d+(?:\.\d+)?)\s*[Bb](?![a-zA-Z])/);
  if (m) return `${m[1]}B`;
  return null;
}

function hwTierFromBackend(tier: string): HwTier {
  switch (tier) {
    case 'low':
      return { label: 'Edge / commodity', color: '#22c55e' };
    case 'mid':
      return { label: 'Mid-tier GPU', color: '#eab308' };
    case 'high':
      return { label: 'Frontier / datacenter', color: '#ef4444' };
    default:
      return { label: 'Unclassified', color: '#6b7280' };
  }
}
