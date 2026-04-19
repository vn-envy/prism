/**
 * Shared persistence layer for PRISM measurement runs.
 *
 * Persists the last N measurement results to the browser's localStorage so
 * that /traces and /memory/[modelId] can read real data from runs executed
 * on /dashboard. All reads and writes are guarded against SSR (no-op on the
 * server).
 */

import type { ModelResult } from './types';

const STORAGE_KEY = 'prism_runs';
const MAX_RUNS = 10;

export interface StoredRun {
  /** Unique ID; generated from Date.now() base-36 on save if absent. */
  id: string;
  /** ISO-8601 timestamp of the run. */
  timestamp: string;
  /** The intent string the user entered. */
  intent: string;
  /** Pillar / CTQ category detected by the backend (may be 'auto' / 'unknown'). */
  pillar: string;
  /** Wall-clock seconds the measurement took. */
  wall_clock_seconds: number;
  /** Total USD cost of the run. */
  total_cost_usd: number;
  /** Full per-model results from the API response. */
  model_results: ModelResult[];
}

/** Per-model historical point derived from stored runs. */
export interface ModelHistoryPoint {
  runId: string;
  timestamp: string;
  /** Composite score — we use `mu` (the judge-panel mean) as the process measurement. */
  score: number;
  cpk: number;
  sigma: number;
}

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/**
 * Persist a run. Generates an ID if missing and keeps only the most recent
 * `MAX_RUNS` entries (newest first).
 */
export function saveRun(run: StoredRun): void {
  if (!isBrowser()) return;
  try {
    const withId: StoredRun = {
      ...run,
      id: run.id || Date.now().toString(36),
      timestamp: run.timestamp || new Date().toISOString(),
    };
    const existing = getRuns();
    // De-dupe by id (in case of hot reload / double-save)
    const filtered = existing.filter((r) => r.id !== withId.id);
    const next = [withId, ...filtered].slice(0, MAX_RUNS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    // localStorage quota or JSON errors — fail silently, this is a UX nicety.
    // eslint-disable-next-line no-console
    console.warn('[prism/store] saveRun failed:', err);
  }
}

/** Return all stored runs, newest first. */
export function getRuns(): StoredRun[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredRun[];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[prism/store] getRuns failed:', err);
    return [];
  }
}

export function getRunById(id: string): StoredRun | null {
  return getRuns().find((r) => r.id === id) ?? null;
}

/**
 * Build per-model history across all stored runs, ordered oldest → newest
 * (so charts read left-to-right chronologically).
 */
export function getModelHistory(modelId: string): ModelHistoryPoint[] {
  const runs = getRuns();
  const decoded = decodeURIComponent(modelId);
  const points: ModelHistoryPoint[] = [];

  // getRuns() returns newest first; reverse to chronological for plotting.
  for (const run of [...runs].reverse()) {
    const match = run.model_results.find(
      (m) => m.model_id === decoded || m.short_name === decoded,
    );
    if (!match) continue;
    points.push({
      runId: run.id,
      timestamp: run.timestamp,
      score: match.mu,
      cpk: match.cpk,
      sigma: match.sigma,
    });
  }
  return points;
}

/**
 * Return the unique list of models that appear in any stored run, along with
 * the most recent run that tested them. Useful for building a "jump to model"
 * selector on the memory page.
 */
export function getAllMeasuredModels(): {
  model_id: string;
  short_name: string;
  last_seen: string;
  run_count: number;
}[] {
  const runs = getRuns();
  const map = new Map<
    string,
    { model_id: string; short_name: string; last_seen: string; run_count: number }
  >();

  // Newest first from getRuns; iterate oldest→newest to aggregate counts but
  // keep the most-recent timestamp.
  for (const run of [...runs].reverse()) {
    for (const m of run.model_results) {
      const existing = map.get(m.model_id);
      if (existing) {
        existing.run_count += 1;
        existing.last_seen = run.timestamp;
      } else {
        map.set(m.model_id, {
          model_id: m.model_id,
          short_name: m.short_name,
          last_seen: run.timestamp,
          run_count: 1,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    b.last_seen.localeCompare(a.last_seen),
  );
}

export function clearRuns(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
