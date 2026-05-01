/**
 * Public route — AI Sitemap XML (standard sitemap.xml format).
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

  const art = await readArtifact(tenant.tenant_id, 'sitemap_xml');
  if (!art) {
    return new NextResponse('Service Unavailable', {
      status: 503,
      headers: { 'Retry-After': '60' },
    });
  }

  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch === `"${art.etag}"`) {
    return new NextResponse(null, { status: 304, headers: { ETag: `"${art.etag}"` } });
  }

  return new NextResponse(art.content, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      ETag: `"${art.etag}"`,
      'X-Robots-Tag': 'noindex',
      'X-Generated-At': art.generated_at,
    },
  });
}
