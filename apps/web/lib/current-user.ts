/**
 * Single source of truth for "who's the current user" in admin paths.
 *
 * Tries the admin HMAC cookie first (dev-bypass + V2 admin-password flow),
 * falls back to Supabase auth (legacy email magic-link). Both return the
 * same shape so server actions don't need to branch.
 */
import { readAdminSession } from './admin-session';
import { createSupabaseServerClient } from './supabase/server';

export type CurrentUser = { id: string; email: string };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const admin = readAdminSession();
  if (admin) return { id: admin.user_id, email: admin.email };

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { id: user.id, email: user.email ?? '' };
  } catch {
    // Supabase auth unreachable (ECS down) — that's OK, we already checked
    // the admin cookie. Just return null.
  }
  return null;
}
