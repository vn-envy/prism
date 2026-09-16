import { getSupabase } from './supabase';
import type { ModelResult } from './types';

export interface SupabaseRunRow {
  id: string;
  intent: string;
  pillar: string;
  wall_clock_seconds: number | string;
  total_cost_usd: number | string;
  model_results: ModelResult[];
  created_at: string;
}

export async function saveRunToSupabase(run: {
  intent: string;
  pillar: string;
  wall_clock_seconds: number;
  total_cost_usd: number;
  model_results: ModelResult[];
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('prism_runs').insert({
    intent: run.intent,
    pillar: run.pillar,
    wall_clock_seconds: run.wall_clock_seconds,
    total_cost_usd: run.total_cost_usd,
    model_results: run.model_results,
  });
}

export async function getRunsFromSupabase(): Promise<SupabaseRunRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('prism_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data as SupabaseRunRow[];
}
