'use server';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const KB_ROOT =
  process.env.KNOWLEDGE_BASE_ROOT ??
  `${process.env.HOME}/Workspace/songshu-knowledge-base`;

const ALLOWED_PLATFORMS = [
  'toutiao_article',
  'douyin_script',
  'wechat_mp',
  'zhihu',
  'xiaohongshu',
  'baijiahao',
  'souhu',
] as const;
type Platform = (typeof ALLOWED_PLATFORMS)[number];

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

const PLATFORM_HINT: Record<Platform, string> = {
  xiaohongshu: '小红书:痛点开头钩子 + 个人化叙事 + 列表分点 + 结尾问句引发评论。300-600 字。',
  douyin_script: '抖音脚本:15 秒钩子 + 视觉化场景 + 单核心信息 + CTA。配分镜建议。',
  wechat_mp: '公众号:故事化引入 + 专业内容 + 结尾引导关注/留言。1200-2000 字。',
  zhihu: '知乎:长文 + 权威引用 + 数据 + 逻辑解释。1500-3000 字。',
  toutiao_article: '头条号:资讯感开头 + 结构化小标题 + 数据/案例 + SEO 关键词。800-1500 字。',
  baijiahao: '百家号:类似头条号,资讯感 + SEO 友好。800-1500 字。',
  souhu: '搜狐号:类似头条号,资讯感 + SEO 友好。800-1500 字。',
};

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
): Promise<{ created: DeriveResult[]; failed: Array<{ platform: Platform; error: string }> }> {
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

  const created: DeriveResult[] = [];
  const failed: Array<{ platform: Platform; error: string }> = [];

  // Run platforms in parallel — independent LLM calls
  await Promise.all(
    validPlatforms.map(async (platform) => {
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
  return { created, failed };
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
      temperature: 0.7,
      max_tokens: 2500,
      response_format: 'json_object',
      timeout_ms: 120_000,
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
