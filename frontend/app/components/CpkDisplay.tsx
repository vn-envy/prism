'use client';

import { useState } from 'react';
import { cpkTier, tierHex, tierLabel } from '../lib/types';

interface CpkDisplayProps {
  cpk: number;
}

/**
 * The hero readout — the Cpk value rendered huge, monospace, color-coded.
 * Hover reveals a definition tooltip in the classic instrument-panel manner.
 */
export default function CpkDisplay({ cpk }: CpkDisplayProps) {
  const [hovered, setHovered] = useState(false);
  const tier = cpkTier(cpk);
  const color = tierHex(tier);

  return (
    <div
      className="relative panel-inset px-4 py-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-baseline justify-between">
        <span className="label-engraved">Cpk</span>
        <span className="text-[9px] uppercase tracking-widest text-neutral-600">
          Process Capability
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span
          className="readout text-5xl font-semibold leading-none"
          style={{ color }}
        >
          {cpk.toFixed(2)}
        </span>
        <span
          className="readout text-xs"
          style={{ color }}
        >
          {tierLabel(tier)}
        </span>
      </div>

      {hovered && (
        <div
          className="absolute z-10 left-4 right-4 top-full mt-1 panel px-3 py-2 text-xs text-neutral-300 shadow-lg"
          role="tooltip"
        >
          <div className="font-mono text-[10px] text-neutral-500 mb-1">
            Cpk — Six Sigma process capability index
          </div>
          <div className="leading-snug text-neutral-400">
            Measures how well the model&rsquo;s output distribution fits within
            the lower specification limit (LSL). Higher is better.
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px]">
            <span style={{ color: '#15803d' }}>≥ 1.67</span>
            <span className="text-neutral-500">World-class (6σ)</span>
            <span style={{ color: '#22c55e' }}>≥ 1.33</span>
            <span className="text-neutral-500">Capable (4σ)</span>
            <span style={{ color: '#eab308' }}>≥ 1.00</span>
            <span className="text-neutral-500">Marginal (3σ)</span>
            <span style={{ color: '#f97316' }}>≥ 0.67</span>
            <span className="text-neutral-500">Not capable (2σ)</span>
            <span style={{ color: '#ef4444' }}>&lt; 0.67</span>
            <span className="text-neutral-500">Incapable (1σ)</span>
          </div>
        </div>
      )}
    </div>
  );
}
