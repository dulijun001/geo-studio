/**
 * Public route — AI Content Feed (JSON aggregate of all entities).
 * Cache window shorter (15 min) since this is the most-data-dense artifact
 * and changes most frequently.
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
    return new NextResponse(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': `${rl.retryAfterSec}`,
      },
    });
  }

  const art = await readArtifact(tenant.tenant_id, 'feed_json');
  if (!art) {
    return new NextResponse(JSON.stringify({ error: 'not_yet_generated' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': '60',
      },
    });
  }

  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch === `"${art.etag}"`) {
    return new NextResponse(null, { status: 304, headers: { ETag: `"${art.etag}"` } });
  }

  return new NextResponse(art.content, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=86400',
      ETag: `"${art.etag}"`,
      'X-Robots-Tag': 'noindex',
      'X-Generated-At': art.generated_at,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
