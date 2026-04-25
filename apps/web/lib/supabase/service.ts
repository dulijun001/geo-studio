import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client for trusted server-side operations that must
 * bypass RLS — e.g. staff login (user not authenticated yet), worker jobs.
 *
 * NEVER import this from a client component. NEVER return rows directly
 * from it to an untrusted caller without additional authorization checks.
 */
let _client: SupabaseClient | undefined;

export function getSupabaseServiceClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
