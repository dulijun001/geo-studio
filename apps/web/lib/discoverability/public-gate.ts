/**
 * Public-route gate: opt-in check + slug validation + rate limit.
 *
 * Every public discoverability route (llms.txt / feed / sitemap) calls
 * resolvePublicTenant() first. Returns null when the route should respond
 * 404 — covering both "tenant doesn't exist" and "tenant exists but not
 * opted-in". Same response either way (D15: don't reveal tenant existence).
 *
 * Rate limit is in-memory + per-process. V1.7 is a single ECS instance, so
 * good enough. V2 multi-replica deployment will need pg-boss-backed or
 * Redis-backed counters — flagged in the function comment.
 */

import { unstable_noStore as noStore } from 'next/cache';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/** Allowed slug shape: lowercase alphanumeric + hyphens, 3-40 chars, must start with letter. */
const SLUG_RE = /^[a-z][a-z0-9-]{2,39}$/;

export function isValidSlug(slug: string): boolean {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

export type PublicTenantResolution = {
  tenant_id: string;
  slug: string;
  public_slug: string | null;
};

/**
 * Look up a tenant by slug and confirm public discoverability is enabled.
 * Returns null on any failure (404 from caller). Uses service-role client
 * because the visitor has no auth context.
 */
export async function resolvePublicTenant(
  slug: string,
): Promise<PublicTenantResolution | null> {
  // Bypass Next 14 Data Cache: the public_enabled flag must be live, never
  // stale. force-dynamic on the route only opts the PAGE out of caching;
  // the fetch() calls Supabase makes underneath still go through the data
  // cache unless explicitly told otherwise.
  noStore();

  if (!isValidSlug(slug)) return null;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, settings')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const disco = (settings.discoverability ?? {}) as Record<string, unknown>;
  if (disco.public_enabled !== true) return null;

  return {
    tenant_id: data.id as string,
    slug: data.slug as string,
    public_slug: (disco.public_slug as string | null | undefined) ?? null,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Rate limiting (in-memory sliding window — single-process)
// ──────────────────────────────────────────────────────────────────────

type Bucket = { windowStart: number; count: number };
const limits = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;

/**
 * Returns { allowed: boolean, retryAfterSec: number }.
 *
 * Key shape: `${slug}:${ip}`. IP comes from x-forwarded-for first hop, with
 * fallback to the connecting peer (best effort behind Caddy).
 *
 * V1.7 limitation: per-process state. Multi-replica = effective limit
 * multiplies by replica count. Ship as is for the single-instance demo;
 * upgrade before scaling out.
 */
export function checkRateLimit(
  slug: string,
  ip: string,
  limit = DEFAULT_LIMIT,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const key = `${slug}:${ip}`;
  const b = limits.get(key);

  if (!b || now - b.windowStart >= WINDOW_MS) {
    limits.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (b.count < limit) {
    b.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  const retryAfterMs = WINDOW_MS - (now - b.windowStart);
  return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
}

/** Periodic eviction so old entries don't accumulate forever. */
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 5 * 60_000;

export function sweepExpiredBuckets(): void {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, b] of limits) {
    if (now - b.windowStart >= WINDOW_MS) limits.delete(k);
  }
}

/**
 * Best-effort client IP extraction from the request. Caddy → Next chain
 * sets x-forwarded-for; first entry is the original client.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
}
