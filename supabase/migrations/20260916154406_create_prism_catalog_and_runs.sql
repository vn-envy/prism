/*
# PRISM: Run History + Pricing Catalog

## 1. Overview
Creates two tables to support the new PRISM features: a public model pricing
catalog (sourced from published provider list prices) and a public run history
table so measurement results are shareable across sessions and devices.

## 2. New Tables
- `model_pricing` — public catalog of LLM models with list prices.
  - `id` (uuid, primary key)
  - `model_id` (text, unique identifier for the model)
  - `short_name` (text, human-readable label)
  - `provider` (text, e.g. Together, OpenAI, Anthropic)
  - `input_cost_per_1k_tokens` (numeric, USD)
  - `output_cost_per_1k_tokens` (numeric, USD)
  - `hardware_tier` (text, e.g. edge/mid/frontier)
  - `parameters_b` (numeric, optional parameter count)
  - created_at, updated_at

- `prism_runs` — persisted measurement runs from dashboard.
  - `id` (uuid, primary key)
  - `intent` (text, the user's intent description)
  - `pillar` (text, CTQ pillar)
  - `wall_clock_seconds` (numeric)
  - `total_cost_usd` (numeric)
  - `model_results` (jsonb, the per-model measurements)
  - `created_at`

## 3. Security
Both tables are single-tenant (no auth) and intentionally public:
- RLS enabled.
- Policies scoped `TO anon, authenticated` with `USING (true)` /
  `WITH CHECK (true)` because the app has no sign-in screen and the data is
  shared by design.

## 4. Indexes
- `idx_prism_runs_created_at` for chronological listing
- `idx_model_pricing_model_id` for quick lookup
*/

CREATE TABLE IF NOT EXISTS model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text UNIQUE NOT NULL,
  short_name text NOT NULL,
  provider text NOT NULL,
  input_cost_per_1k_tokens numeric NOT NULL,
  output_cost_per_1k_tokens numeric NOT NULL,
  hardware_tier text,
  parameters_b numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_model_pricing" ON model_pricing;
CREATE POLICY "public_read_model_pricing" ON model_pricing
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_insert_model_pricing" ON model_pricing;
CREATE POLICY "public_insert_model_pricing" ON model_pricing
FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_model_pricing" ON model_pricing;
CREATE POLICY "public_update_model_pricing" ON model_pricing
FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_model_pricing_model_id ON model_pricing (model_id);

CREATE TABLE IF NOT EXISTS prism_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent text NOT NULL,
  pillar text NOT NULL DEFAULT 'auto',
  wall_clock_seconds numeric NOT NULL,
  total_cost_usd numeric NOT NULL,
  model_results jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prism_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_prism_runs" ON prism_runs;
CREATE POLICY "public_read_prism_runs" ON prism_runs
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_insert_prism_runs" ON prism_runs;
CREATE POLICY "public_insert_prism_runs" ON prism_runs
FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_prism_runs_created_at ON prism_runs (created_at DESC);

/*
# Seed: published provider list prices (verified 2026-09)
Insert well-known models so the catalog works out of the box.
These are the same list prices documented in the pricing section of the
README and dashboard; they are illustrative and can be updated.
*/
INSERT INTO model_pricing (model_id, short_name, provider, input_cost_per_1k_tokens, output_cost_per_1k_tokens, hardware_tier, parameters_b)
VALUES
  ('qwen-2.5-72b', 'Qwen 2.5 72B', 'Together', 0.0011, 0.0012, 'high', 72),
  ('sarvam-m-24b', 'Sarvam-M 24B', 'Together', 0.0018, 0.0018, 'mid', 24),
  ('deepseek-v3', 'DeepSeek V3', 'Together', 0.0009, 0.0009, 'high', 236),
  ('llama-3.3-70b', 'Llama 3.3 70B', 'Together', 0.0009, 0.0009, 'mid', 70),
  ('gpt-oss-120b', 'GPT-OSS 120B', 'Together', 0.003, 0.003, 'high', 120),
  ('mistral-large', 'Mistral Large', 'Mistral', 0.002, 0.006, 'high', null),
  ('command-r-plus', 'Command R+', 'Cohere', 0.003, 0.015, 'high', null),
  ('phi-4', 'Phi-4 14B', 'Microsoft', 0.0002, 0.0002, 'edge', 14),
  ('gemini-2.5-flash', 'Gemini 2.5 Flash', 'Google', 0.00015, 0.0006, 'edge', null),
  ('claude-3.5-sonnet', 'Claude 3.5 Sonnet', 'Anthropic', 0.003, 0.015, 'mid', null)
ON CONFLICT (model_id) DO NOTHING;
