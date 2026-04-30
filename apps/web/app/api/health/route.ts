import { NextResponse } from 'next/server';

/**
 * Lightweight health probe for Caddy / load balancer.
 *
 * Intentionally does NOT touch Postgres — keeping it cheap means the LB can
 * poll every 10s without adding load. If you need a "deep" health check
 * (DB connectivity, Supabase auth reachable) put it under /api/health/deep
 * and gate it to internal callers.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'geo-web',
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
