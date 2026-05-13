'use server';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { PLATFORM_HINT, VARIANT_PLATFORMS, type VariantPlatform } from '@geo/shared';
import { requireRole } from '@/lib/tenant';
import { getCurrentUser } from '@/lib/current-user';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const KB_ROOT =
  process.env.KNOWLEDGE_BASE_ROOT ??
  `${process.env.HOME}/Workspace/songshu-knowledge-base`;

// VAR-1 — pull from shared so 'douyin_image_text' (added in 0022) and any
// future platforms are automatically allowed without a second-source drift.
const ALLOWED_PLATFORMS = VARIANT_PLATFORMS;
type Platform = VariantPlatform;

/**
 * VAR-2 — count active variants per platform for a content_item, so the
 * UI can warn before re-generating ("toutiao_article 已有 3 条变体,继续会
 * 再加 1 条;如果想替换请先删除旧的").
 */
export async function getVariantPlatformCounts(
  tenantSlug: string,
  contentItemId: string,
): Promise<Record<string, number>> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('content_variants')
    .select('platform')
    .eq('content_item_id', contentItemId)
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const p = row.platform as string;
    counts[p] = (counts[p] ?? 0) + 1;
  }
  return counts;
}

/**
 * Kick off variant generation for the given content item.
 * Server action: the actual LLM + insert work happens in the worker so the
 * request returns fast and we don't hit Vercel's 10s limit on cold generations.
 */
export async function enqueueVariantGenerate(
  tenantSlug: string,
  contentItemId: string,
  platforms: Platform[],
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const validPlatforms = platforms.filter((p): p is Platform =>
    (ALLOWED_PLATFORMS as readonly string[]).includes(p),
  );
  if (validPlatforms.length === 0) {
    throw new Error('请至少选择一个目标平台。');
  }

  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthenticated');

  // Verify the content item belongs to this tenant and is actually parsed.
  const { data: item, error: iErr } = await supabase
    .from('content_items')
    .select('id, tenant_id, markdown, status')
    .eq('id', contentItemId)
    .single();
  if (iErr || !item) throw new Error(`Content item not found: ${iErr?.message}`);
  if (item.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (!item.markdown || item.markdown.trim().length < 20) {
    throw new Error('源内容过短或尚未解析完成,请先等待解析或检查上传的文件。');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  try {
    await boss.createQueue('content.variant_generate');
    await boss.send('content.variant_generate', {
      content_item_id: item.id,
      tenant_id: tenant.id,
      platforms: validPlatforms,
      triggered_by: user.id,
    });
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }

  revalidatePath(`/t/${tenantSlug}/content/${contentItemId}`);
}

// ============================================================================
// Derive drafts to other platforms (V1.6-7)
//
// Take an existing AI-drafted content item and rewrite it to N other
// platforms in parallel — one LLM call per platform, each reads the platform
// guide from the customer KB. Citations from the parent are copied so the
// derivative chain stays traceable in V1.8 attribution.
// ============================================================================

const PLATFORM_KB_GUIDE: Partial<Record<Platform, string>> = {
  xiaohongshu: '营销/渠道/小红书/风格指南.md',
  douyin_script: '营销/渠道/抖音/风格指南.md',
};

// PLATFORM_HINT moved to @geo/shared (DEBT-1) — see imports above.

const REWRITE_SYSTEM = `你是医疗内容编辑,负责把一篇已通过医生 review 的内容,改写为不同平台风格,提高内容矩阵覆盖。

## 硬约束
1. 严禁绝对化(最/第一/根治/包治)、效果承诺(保证/100%/无效退款)、安全性夸大(无痛/零风险)、违规比较(比XX好)
2. 不要编造原文没有的数据、医生姓名;只重新组织表达和结构
3. 保留原文事实(医生姓名 / 数字 / 专业判断不动)
4. 按目标平台调性重写(标题 + 正文)
5. 输出严格 JSON: { "title": "新标题(15字内)", "body": "新正文(markdown)", "tactics": ["cite_sources","add_statistics",...] }`;

export type DeriveResult = { platform: Platform; content_item_id: string };

export async function deriveDraftsToOtherPlatforms(
  tenantSlug: string,
  parentContentItemId: string,
  targetPlatforms: Platform[],
): Promise<{
  created: DeriveResult[];
  failed: Array<{ platform: Platform; error: string }>;
  /** DEBT-3 — platforms skipped because this parent already has a derivative for them. */
  skipped: Platform[];
}> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const validPlatforms = targetPlatforms.filter((p): p is Platform =>
    (ALLOWED_PLATFORMS as readonly string[]).includes(p),
  );
  if (validPlatforms.length === 0) throw new Error('请至少选 1 个目标平台');

  const service = getSupabaseServiceClient();

  // Load parent
  const { data: parent, error: pErr } = await service
    .from('content_items')
    .select('id, tenant_id, title, markdown, topics')
    .eq('id', parentContentItemId)
    .single();
  if (pErr || !parent) throw new Error('原始内容不存在');
  if (parent.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (!parent.markdown || parent.markdown.trim().length < 30) {
    throw new Error('原文太短,无法派生');
  }

  // Parent's citations — we'll copy these to each derivative
  const { data: parentCitations } = await service
    .from('content_citations')
    .select('knowledge_source_id, excerpt_used, confidence')
    .eq('content_item_id', parentContentItemId);

  // DEBT-3 — find existing derivatives so we don't silently re-create them.
  // The topics column carries `derived_from:<platform>` markers we wrote
  // last time, so a single SELECT on topics @> array tells us which
  // platforms have already been derived. (Postgres array contains.)
  const { data: existingDerivs } = await service
    .from('content_items')
    .select('id, topics')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const alreadyDerived = new Set<string>();
  for (const d of existingDerivs ?? []) {
    const topics = (d.topics as string[] | null) ?? [];
    for (const t of topics) {
      const m = t.match(/^derived_from:(.+)$/);
      // Only count derivatives whose topics ALSO match the parent's topic
      // set (i.e. the deriv was made FROM this parent specifically).
      if (m && parent.topics && (parent.topics as string[]).every((pt) => topics.includes(pt))) {
        alreadyDerived.add(m[1]!);
      }
    }
  }

  const created: DeriveResult[] = [];
  const failed: Array<{ platform: Platform; error: string }> = [];
  const skipped: Platform[] = [];

  // Run platforms in parallel — independent LLM calls. Skip any platform we
  // already derived for THIS parent so a misclick doesn't double-bill.
  await Promise.all(
    validPlatforms.map(async (platform) => {
      if (alreadyDerived.has(platform)) {
        skipped.push(platform);
        return;
      }
      try {
        const newItem = await derivOne(
          tenant.id,
          parent.title as string,
          parent.markdown as string,
          (parent.topics as string[]) ?? [],
          platform,
          parentCitations ?? [],
        );
        created.push({ platform, content_item_id: newItem });
      } catch (err) {
        failed.push({ platform, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  revalidatePath(`/t/${tenantSlug}/content`);
  revalidatePath(`/t/${tenantSlug}/content/${parentContentItemId}`);
  return { created, failed, skipped };
}

async function derivOne(
  tenantId: string,
  parentTitle: string,
  parentMarkdown: string,
  parentTopics: string[],
  platform: Platform,
  parentCitations: Array<{ knowledge_source_id: string; excerpt_used: string | null; confidence: number | null }>,
): Promise<string> {
  const service = getSupabaseServiceClient();

  // Load platform guide if available
  let platformGuide: string | null = null;
  const guidePath = PLATFORM_KB_GUIDE[platform];
  if (guidePath) {
    try {
      const raw = await readFile(join(KB_ROOT, guidePath), 'utf-8');
      platformGuide = raw
        .replace(/^---[\s\S]*?---\s*/m, '')
        .replace(/##\s*元信息[\s\S]*?(?=##|\z)/m, '')
        .slice(0, 1200);
    } catch {
      // fall through to PLATFORM_HINT
    }
  }
  const platformBlock = platformGuide
    ? `# 平台调性(客户维护)\n\n${platformGuide}`
    : `# 平台调性\n\n${PLATFORM_HINT[platform]}`;

  let title = parentTitle;
  let body = parentMarkdown;
  let tactics: string[] = [];

  if (llmAvailable()) {
    const result = await chat({
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        {
          role: 'user',
          content:
            `# 目标平台\n${platform}\n\n${platformBlock}\n\n` +
            `# 原始标题\n${parentTitle}\n\n` +
            `# 原始正文(已通过 review)\n${parentMarkdown}\n\n` +
            `# 输出要求\n严格输出 JSON: { title, body, tactics }`,
        },
      ],
      // Cross-platform rewrite is content generation; use FAST model.
      model: process.env.ARK_MODEL_FAST,
      temperature: 0.7,
      max_tokens: 2500,
      response_format: 'json_object',
      timeout_ms: 90_000,
    });
    try {
      const parsed = JSON.parse(result.content) as {
        title?: string;
        body?: string;
        tactics?: string[];
      };
      title = parsed.title?.trim() || parentTitle;
      body = parsed.body?.trim() || parentMarkdown;
      tactics = Array.isArray(parsed.tactics) ? parsed.tactics.slice(0, 9) : [];
    } catch {
      // fall through to copy
    }
  } else {
    title = `[STUB ${platform}] ${parentTitle}`;
    body = `> 派生草稿(stub 模式 — ARK_API_KEY 未配置)\n\n${parentMarkdown}`;
  }

  // Insert as a new content_item with status='ai_drafted'
  const { data: created, error: insErr } = await service
    .from('content_items')
    .insert({
      tenant_id: tenantId,
      title: title.slice(0, 200),
      source_type: 'manual',
      status: 'ai_drafted',
      markdown: body,
      topics: [...parentTopics, `derived_from:${platform}`].slice(0, 10),
    })
    .select('id')
    .single();
  if (insErr || !created) throw new Error(`保存失败: ${insErr?.message}`);

  // Copy parent's citations
  if (parentCitations.length > 0) {
    await service.from('content_citations').insert(
      parentCitations.map((c) => ({
        tenant_id: tenantId,
        content_item_id: created.id,
        knowledge_source_id: c.knowledge_source_id,
        excerpt_used: c.excerpt_used,
        confidence: c.confidence,
      })),
    );
  }

  return created.id as string;
}

/**
 * D21 / ADR 009 §13.3 manual_pass — admin override for a DoD-failed item.
 *
 * When an article scores L2 ≥ 60 + LLM clearly wrote 5 FAQ but extractor
 * missed one (or any other extractor edge case), admin can manually pass
 * after eyeballing. Records override_by / override_at / override_reason in
 * dod_evidence for audit trail. Reversible by setting back to 'failed'.
 */
export async function manualPassDod(
  tenantSlug: string,
  contentItemId: string,
  reason: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthenticated');

  if (reason.trim().length < 4) {
    throw new Error('请填写覆盖原因(至少 4 个字),会记入审计');
  }

  const { data: item, error: getErr } = await supabase
    .from('content_items')
    .select('id, dod_status, dod_evidence')
    .eq('id', contentItemId)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (getErr || !item) throw new Error('content_item 不存在');
  if (item.dod_status !== 'failed') {
    throw new Error(`只有 dod_status='failed' 可以手动通过,当前=${item.dod_status}`);
  }

  const prevEvidence = (item.dod_evidence ?? {}) as Record<string, unknown>;
  const newEvidence = {
    ...prevEvidence,
    override_by: user.id,
    override_by_email: user.email,
    override_at: new Date().toISOString(),
    override_reason: reason.trim().slice(0, 500),
  };

  const { error: updErr } = await supabase
    .from('content_items')
    .update({
      dod_status: 'manual_pass',
      dod_evidence: newEvidence,
    })
    .eq('id', contentItemId)
    .eq('tenant_id', tenant.id);
  if (updErr) throw new Error(`手动通过失败: ${updErr.message}`);

  revalidatePath(`/t/${tenantSlug}/content/${contentItemId}`);
}
