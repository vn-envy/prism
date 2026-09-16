import { getSupabase, PricingRow } from './supabase';

export async function getPricingCatalog(): Promise<PricingRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('model_pricing')
    .select('*')
    .order('input_cost_per_1k_tokens', { ascending: true });
  if (error || !data) return [];
  return data as PricingRow[];
}

export async function getPricingFor(
  modelIds: string[],
): Promise<Map<string, PricingRow>> {
  const supabase = getSupabase();
  if (!supabase) return new Map();
  const { data, error } = await supabase
    .from('model_pricing')
    .select('*')
    .in('model_id', modelIds);
  if (error || !data) return new Map();
  return new Map((data as PricingRow[]).map((p) => [p.model_id, p]));
}
