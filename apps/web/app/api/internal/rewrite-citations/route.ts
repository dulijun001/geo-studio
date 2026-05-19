/**
 * Internal bulk citation-rewrite API.
 *
 * Identical logic to compliance/actions.ts → aiRewriteCitations, but with
 * HMAC secret auth (not user cookie). Lets a python bulk script clean out
 * all suspected_hallucination variants in one go without 30 manual clicks.
 *
 * Auth: x-internal-secret header must equal DRAFT_INTERNAL_SECRET.
 * Body:  { tenant_id: string, variant_id: string }
 * Returns: { ok, changes? } | { error }
 */
import { NextResponse } from 'next/server';
import PgBoss from 'pg-boss';
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { reportError } from '@geo/shared';
import { lookupNeedlesInKb } from '@/lib/kb-needle-lookup';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CITATION_REWRITE_SYSTEM = `你是医疗内容编辑,任务是把一篇文章里**白名单未匹配**的可疑引用清理掉,同时保留其余所有事实和结构。

铁律:
1. 输出必须仍然合规(不引入"最/根治/100%/无痛"等违规词)
2. 数字、医生姓名、其他段落不要乱动 — 只针对指定的可疑引用修改
3. 输出严格 JSON: { "title": "新标题", "body": "新正文 markdown", "changes": ["原句 → 改后" 字符串数组] }`;

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.DRAFT_INTERNAL_SECRET;
  if (!secret) return NextResponse.json({ error: 'secret not configured' }, { status: 500 });
  if (req.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { tenant_id?: string; variant_id?: string };
  const { tenant_id, variant_id } = body;
  if (!tenant_id || !variant_id) {
    return NextResponse.json({ error: 'tenant_id + variant_id required' }, { status: 422 });
  }
  if (!llmAvailable()) {
    return NextResponse.json({ error: 'LLM not configured' }, { status: 503 });
  }

  const service = getSupabaseServiceClient();

  const { data: variant, error: vErr } = await service
    .from('content_variants')
    .select('id, tenant_id, title, body, platform, status, compliance_status, citation_check')
    .eq('id', variant_id)
    .single();
  if (vErr || !variant) return NextResponse.json({ error: 'variant not found' }, { status: 404 });
  if (variant.tenant_id !== tenant_id) {
    return NextResponse.json({ error: 'tenant mismatch' }, { status: 403 });
  }
  if (['dispatched', 'published'].includes(variant.status as string)) {
    return NextResponse.json({ error: 'variant locked (dispatched/published)' }, { status: 409 });
  }

  const cc = variant.citation_check as
    | { verdict?: string; unmatched?: Array<{ needle: string }> }
    | null;
  if (cc?.verdict !== 'suspected_hallucination' || !cc.unmatched?.length) {
    return NextResponse.json({ error: 'no suspected_hallucination needles' }, { status: 400 });
  }

  const needles = cc.unmatched.map((u) => u.needle).filter(Boolean);
  const verdicts = await lookupNeedlesInKb(needles);
  const inKb = verdicts.filter((v) => v.in_kb);
  const notInKb = verdicts.filter((v) => !v.in_kb);

  const instructions: string[] = [];
  if (inKb.length) {
    instructions.push(
      `## 🟢 这些引用 KB 里有(医院营销话术,但没获得第三方背书),**软化措辞**不要直接抄:\n` +
        inKb
          .map(
            (v) =>
              `- "${v.needle}" → 改成弱化表达(如"国内唯一一家"→"云南较早一批","X 项国际金标准"→"X 项内部质控流程","包治牙周炎"→"针对性诊疗牙周炎")`,
          )
          .join('\n'),
    );
  }
  if (notInKb.length) {
    instructions.push(
      `## 🔴 这些引用 KB 里也没有(LLM 真编造),**整句删除或替换为"据相关临床指南"**这种通用表述:\n` +
        notInKb.map((v) => `- "${v.needle}"`).join('\n'),
    );
  }

  const userPrompt =
    `# 平台\n${variant.platform}\n\n` +
    `# 原始标题\n${variant.title}\n\n` +
    `# 原始正文\n${variant.body}\n\n` +
    `# 引用核实问题\n\n${instructions.join('\n\n')}\n\n` +
    `# 输出 JSON\n` +
    `- title: 标题(可保持不变)\n` +
    `- body: 改写后的正文(其他段落原样保留,只动指定引用所在的句子)\n` +
    `- changes: 列出每处实际改动的字符串数组`;

  let parsed: { title?: string; body?: string; changes?: string[] };
  try {
    const result = await chat({
      messages: [
        { role: 'system', content: CITATION_REWRITE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      model: process.env.ARK_MODEL_FAST,
      temperature: 0.4,
      max_tokens: 4000,
      response_format: 'json_object',
      timeout_ms: 120_000,
    });
    parsed = JSON.parse(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reportError(err, {
      scope: 'api.internal.rewrite_citations',
      tenant_id,
      extra: { variant_id, platform: variant.platform },
    });
    return NextResponse.json({ error: `LLM failed: ${msg.slice(0, 150)}` }, { status: 502 });
  }

  const newTitle = (parsed.title ?? variant.title).trim().slice(0, 200);
  const newBody = (parsed.body ?? '').trim();
  if (newBody.length < 30) {
    return NextResponse.json({ error: 'body too short after rewrite' }, { status: 502 });
  }

  await service
    .from('content_variants')
    .update({
      title: newTitle,
      body: newBody,
      citation_check: null,
      compliance_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', variant_id);

  await service.from('audit_logs').insert({
    tenant_id,
    action: 'compliance.ai_rewrite_citations.bulk',
    target_type: 'content_variant',
    target_id: variant_id,
    payload: {
      changes: parsed.changes ?? [],
      in_kb_needles: inKb.map((v) => v.needle),
      not_in_kb_needles: notInKb.map((v) => v.needle),
    },
  });

  // Re-enqueue compliance review
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const boss = new PgBoss({ connectionString: dbUrl, schema: 'pgboss', max: 1 });
    await boss.start();
    try {
      await boss.createQueue('compliance.review');
      await boss.send('compliance.review', {
        variant_id,
        tenant_id,
      });
    } finally {
      await boss.stop({ graceful: true, timeout: 5000 });
    }
  }

  return NextResponse.json({ ok: true, changes: parsed.changes ?? [] });
}
