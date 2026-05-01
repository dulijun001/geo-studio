/**
 * Public route — short llms.txt for AI crawlers.
 *
 * Security checklist (D15/D16, see ADR 005):
 *   1. slug shape validated (regex)
 *   2. tenant resolved + public_enabled checked → 404 on either fail
 *   3. rate-limit per IP+slug (in-memory, 60/min)
 *   4. artifact read via service-role from materialized cache
 *   5. ETag + If-None-Match → 304
 *   6. Cache-Control set for edge caching
 *
 * Response headers tuned for AI crawlers (Cache-Control, robots).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  checkRateLimit,
  clientIp,
  resolvePublicTenant,
  sweepExpiredBuckets,
} from '@/lib/discoverability/public-gate';
import { readArtifact } from '@/lib/discoverability/read-artifact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND = new NextResponse('Not Found', { status: 404 });

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  sweepExpiredBuckets();

  const tenant = await resolvePublicTenant(params.slug);
  if (!tenant) return NOT_FOUND;

  const ip = clientIp(req.headers);
  const rl = checkRateLimit(params.slug, ip);
  if (!rl.allowed) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': `${rl.retryAfterSec}` },
    });
  }

  const art = await readArtifact(tenant.tenant_id, 'llms_txt');
  if (!art) {
    return new NextResponse('Service Unavailable: artifact not yet generated', {
      status: 503,
      headers: { 'Retry-After': '60' },
    });
  }

  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === `"${art.etag}"`) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: `"${art.etag}"` },
    });
  }

  return new NextResponse(art.content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      ETag: `"${art.etag}"`,
      'X-Robots-Tag': 'noindex',
      'X-Generated-At': art.generated_at,
    },
  });
}
