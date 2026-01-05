import test from 'node:test';
import assert from 'node:assert/strict';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Keeping this focused on configuration validation until we wire in @supabase/supabase-js.
// This ensures early feedback without forcing secrets into the repo.

test('supabase credentials are available', { skip: !supabaseUrl || !supabaseAnonKey }, () => {
  assert.ok(supabaseUrl, 'SUPABASE_URL is required to run Supabase tests');
  assert.ok(supabaseAnonKey, 'SUPABASE_ANON_KEY is required to run Supabase tests');
});
