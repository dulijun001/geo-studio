import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Use inside Client Components only.
 * Anonymous key is safe to expose; RLS policies enforce tenant isolation.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
