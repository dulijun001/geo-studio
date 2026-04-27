import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { readAdminSession } from '@/lib/admin-session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * Server-side Supabase client. Use this inside Server Components, Server Actions, Route Handlers.
 *
 * Two paths:
 *   - Admin HMAC cookie present (dev-bypass / future password flow): return
 *     the service-role client, bypassing RLS. Trust comes from the cookie HMAC,
 *     which is verified upstream by requireRole/requireTenantMember. All
 *     queries in the codebase explicitly filter by tenant_id, so RLS bypass
 *     does NOT break tenant isolation — it just removes the redundant check.
 *   - Otherwise: anon-key SSR client with cookie-backed Supabase auth session.
 *
 * Why this matters: super-admin / admin cookie holders have no Supabase auth
 * session, so an anon-key client returns empty results from RLS-protected
 * tables (knowledge_sources, content_variants, etc.). Without this branch,
 * the entire admin UI shows "no data" when /login/dev is used.
 */
export function createSupabaseServerClient() {
  if (readAdminSession()) {
    return getSupabaseServiceClient();
  }

  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set',
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components cannot set cookies; swallow per Supabase guidance.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // ditto
        }
      },
    },
  });
}
