import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

let client: SupabaseClient | null = null;

/**
 * Browser- and server-safe Supabase singleton. Returns null when the
 * environment is not configured so features degrade to localStorage.
 */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}

export interface PricingRow {
  id: string;
  model_id: string;
  short_name: string;
  provider: string;
  input_cost_per_1k_tokens: number;
  output_cost_per_1k_tokens: number;
  hardware_tier: string | null;
  parameters_b: number | null;
}
