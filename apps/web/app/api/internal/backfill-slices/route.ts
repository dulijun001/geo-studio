/**
 * Internal backfill — D21 / ADR 009 P3.
 *
 * 把 legacy content_items 跑一遍 slice extractor + DoD evaluator,把结果
 * 写回 slices / dod_* 字段. 服务于:
 *   - 让首屏 D21 评分卡老内容也能看 slices
 *   - 让公开路由 llms.txt / feed.json 立刻有 typed slices 输出
 *   - 让 dispatch 看到老内容真实质量(legacy_passed → passed/failed)
 *
 * Auth: x-internal-secret = DRAFT_INTERNAL_SECRET (复用,不另设 env).
 *
 * Body: { tenant_id: string, limit?: number (default 500), only_empty?: boolean (default true) }
 * Returns: { tenant_id, processed, slice_filled, dod_evaluated, dod_passed,
 *            dod_failed, samples: [...] }
 *
 * Idempotent: only_empty=true 跳过已有 slices 的行;false 强制覆盖.
 */
import { NextResponse } from 'next/server';
import { evaluateDod, extractSlices } from '@geo/geo-core';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 50;

type Body = {
  tenant_id?: string;
  limit?: number;
  only_empty?: boolean;
};

type ContentItemRow = {
  id: string;
  title: string;
  markdown: string;
  slices: Record<string, unknown> | null;
};

type BrandRow = { name: string | null; location: Record<string, unknown> | null };

type SampleResult = {
  id: string;
  title: string;
  slice_count: number;
  dod_status: 'passed' | 'failed';
  dod_score: number;
  fail_reasons?: string[];
};

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.DRAFT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'DRAFT_INTERNAL_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.tenant_id) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 422 });
  }

  const tenantId = body.tenant_id;
  const limit = Math.min(body.limit ?? 500, 1000);
  const onlyEmpty = body.only_empty !== false;

  const service = getSupabaseServiceClient();

  // Brand context for entity slice
  const { data: brandRow } = await service
    .from('brands')
    .select('name, location')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const brand = brandRow as BrandRow | null;
  const brandLoc = (brand?.location ?? {}) as { city?: string };
  const ctx = {
    brand_name: brand?.name ?? undefined,
    city: typeof brandLoc.city === 'string' ? brandLoc.city : undefined,
    is_medical: true as const,
  };

  // Fetch candidates
  let query = service
    .from('content_items')
    .select('id, title, markdown, slices')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .not('markdown', 'is', null)
    .neq('markdown', '')
    .limit(limit);

  if (onlyEmpty) {
    query = query.eq('slices', '{}');
  }

  const { data: rows, error: qErr } = await query;
  if (qErr) {
    return NextResponse.json({ error: `query failed: ${qErr.message}` }, { status: 500 });
  }
  const items = (rows ?? []) as ContentItemRow[];

  let sliceFilled = 0;
  let dodPassed = 0;
  let dodFailed = 0;
  const samples: SampleResult[] = [];

  // Process in batches to avoid hammering the DB
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (row) => {
        try {
          const slices = extractSlices({ body: row.markdown, ctx });
          const dod = evaluateDod({
            title: row.title,
            body: row.markdown,
            slices,
            ctx,
          });

          const updateRes = await service
            .from('content_items')
            .update({
              slices,
              dod_status: dod.status,
              dod_score: dod.score,
              dod_evidence: dod.evidence,
              dod_evaluated_at: dod.evidence.evaluated_at,
            })
            .eq('id', row.id);

          if (updateRes.error) {
            return; // skip this row, don't crash batch
          }

          sliceFilled++;
          if (dod.status === 'passed') dodPassed++;
          else dodFailed++;

          if (samples.length < 5) {
            const sliceCount = countSlices(slices);
            samples.push({
              id: row.id,
              title: row.title,
              slice_count: sliceCount,
              dod_status: dod.status,
              dod_score: dod.score,
              ...(dod.status === 'failed' && {
                fail_reasons: dod.evidence.reasons.slice(0, 3),
              }),
            });
          }
        } catch (err) {
          console.error('[backfill-slices] row failed', row.id, err);
        }
      }),
    );
  }

  return NextResponse.json({
    tenant_id: tenantId,
    processed: items.length,
    slice_filled: sliceFilled,
    dod_evaluated: dodPassed + dodFailed,
    dod_passed: dodPassed,
    dod_failed: dodFailed,
    samples,
  });
}

function countSlices(slices: ReturnType<typeof extractSlices>): number {
  let n = 0;
  if (slices.direct_answer) n++;
  if (slices.summary_1) n++;
  if (slices.summary_3) n++;
  if (slices.myth_busting_block) n++;
  if (slices.when_to_seek_care) n++;
  if (slices.faq_pairs && slices.faq_pairs.length > 0) n++;
  if (slices.entity_snapshot && Object.keys(slices.entity_snapshot).length > 0) n++;
  if (slices.trust_block && Object.keys(slices.trust_block).length > 0) n++;
  return n;
}
