'use server';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/tenant';

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/pdf',
  'text/markdown',
  'text/plain',
]);

const EXT_BY_MIME: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'text/markdown': 'md',
  'text/plain': 'txt',
};

const SOURCE_TYPE_BY_MIME: Record<string, 'word' | 'pdf' | 'manual'> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/msword': 'word',
  'application/pdf': 'pdf',
  'text/markdown': 'manual',
  'text/plain': 'manual',
};

export type CreateUploadSlotResult = {
  content_item_id: string;
  storage_path: string;
  signed_upload: { token: string; path: string };
};

/**
 * Step 1 of upload. Creates the content_items row and returns a signed URL
 * the browser can POST the file to. Enqueue happens after the upload completes
 * (see `enqueueParse` below) so a network failure mid-upload doesn't leave
 * a stuck job.
 */
export async function createUploadSlot(
  tenantSlug: string,
  input: { title: string; mime: string; filename: string },
): Promise<CreateUploadSlotResult> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  if (!ALLOWED_MIME.has(input.mime)) {
    throw new Error(`Unsupported file type: ${input.mime}`);
  }
  const title = input.title.trim() || input.filename;
  if (title.length === 0) throw new Error('Title required');

  const supabase = createSupabaseServerClient();
  const source_type = SOURCE_TYPE_BY_MIME[input.mime] ?? 'manual';

  const { data: inserted, error: insertErr } = await supabase
    .from('content_items')
    .insert({
      tenant_id: tenant.id,
      title,
      source_type,
      status: 'draft',
      markdown: '',
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    throw new Error(`Failed to create content item: ${insertErr?.message}`);
  }

  const ext = EXT_BY_MIME[input.mime] ?? 'bin';
  const path = `${tenant.id}/${inserted.id}.${ext}`;

  const { data: signed, error: signErr } = await supabase.storage
    .from('content-uploads')
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    // Roll back the content_items row so we don't litter drafts.
    await supabase.from('content_items').delete().eq('id', inserted.id);
    throw new Error(`Failed to create signed upload URL: ${signErr?.message}`);
  }

  // Record the intended storage_path upfront so the worker can find it later.
  await supabase
    .from('content_items')
    .update({ source_url: path })
    .eq('id', inserted.id);

  return {
    content_item_id: inserted.id,
    storage_path: path,
    signed_upload: { token: signed.token, path: signed.path },
  };
}

/**
 * Step 2: called after the client confirms the upload succeeded.
 * Enqueues the parse job; worker picks it up and fills in markdown + status.
 */
export async function enqueueParse(
  tenantSlug: string,
  content_item_id: string,
  mime: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const supabase = createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from('content_items')
    .select('id, tenant_id, source_url, status')
    .eq('id', content_item_id)
    .single();
  if (error || !row) throw new Error(`Content item not found: ${error?.message}`);
  if (row.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (!row.source_url) throw new Error('No storage path set');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  try {
    // pg-boss v10 requires queues to exist before send.
    await boss.createQueue('content.parse');
    await boss.send('content.parse', {
      content_item_id: row.id,
      tenant_id: row.tenant_id,
      storage_path: row.source_url,
      mime_type: mime,
    });
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }
}

// ============================================================================
// AI draft (V1.5-8)
//
// Synchronous RAG draft generation: simple keyword-overlap recall over
// knowledge_sources → load source bodies from KB_ROOT → LLM compose → write
// content_items.status='ai_drafted' + content_citations rows.
//
// V1: blocking server action (30-50s typical). V2: hand off to pg-boss with
// a polling status endpoint if UX research shows users want to navigate away.
// ============================================================================

const KB_ROOT =
  process.env.KNOWLEDGE_BASE_ROOT ??
  `${process.env.HOME}/Workspace/songshu-knowledge-base`;

const DRAFT_RECALL_K = 5;

export type CreateAiDraftInput = {
  topic: string;
  audience: string;
  platform: 'xiaohongshu' | 'douyin_script' | 'wechat_mp' | 'zhihu' | 'toutiao_article';
};

export type CreateAiDraftResult = {
  content_item_id: string;
  /** Source paths actually cited in the generated draft */
  cited_paths: string[];
};

const PLATFORM_HINT: Record<CreateAiDraftInput['platform'], string> = {
  xiaohongshu: '小红书：痛点开头钩子 + 个人化叙事 + 列表分点 + 结尾问句引发评论。300-600 字。',
  douyin_script: '抖音脚本：15 秒钩子 + 视觉化场景描述 + 单个核心信息 + CTA。提供分镜建议。',
  wechat_mp: '公众号：故事化引入 + 专业内容 + 结尾引导关注/留言。1200-2000 字。',
  zhihu: '知乎：长文 + 权威引用 + 数据 + 逻辑解释 + 个人专业判断。1500-3000 字。',
  toutiao_article:
    '头条号：资讯感开头 + 结构化小标题 + 数据/案例 + SEO 友好关键词。800-1500 字。',
};

/**
 * Token-overlap recall — minimal viable RAG without embeddings.
 *
 * Score = title hits × 3 + excerpt hits × 1. Chinese substring matching
 * (no proper tokenizer yet — V2 plugs in pgvector or a tokenizer + BM25).
 * Good enough to find "种植" content for "种植牙" queries.
 */
function scoreSource(query: string, source: { title: string | null; excerpt: string | null }): number {
  const tokens = query
    .replace(/[，。！？、:：；,.!?;]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;
  const title = source.title ?? '';
  const excerpt = source.excerpt ?? '';
  let score = 0;
  for (const t of tokens) {
    if (title.includes(t)) score += 3;
    if (excerpt.includes(t)) score += 1;
  }
  return score;
}

export async function createAiDraft(
  tenantSlug: string,
  input: CreateAiDraftInput,
): Promise<CreateAiDraftResult> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const topic = input.topic.trim();
  const audience = input.audience.trim();
  if (topic.length < 2) throw new Error('请输入主题(至少 2 字)');
  if (audience.length === 0) throw new Error('请选择受众');
  if (!PLATFORM_HINT[input.platform]) throw new Error('不支持的平台');

  const supabase = createSupabaseServerClient();

  // 1. Recall — fetch all indexable sources for tenant, score in JS.
  //    For ~200 sources this is fine; > 1000 we'd need tsvector / pgvector.
  const { data: candidates, error: recallErr } = await supabase
    .from('knowledge_sources')
    .select('id, source_path, title, excerpt')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  if (recallErr) throw new Error(`检索知识库失败: ${recallErr.message}`);
  if (!candidates?.length) {
    throw new Error('知识库为空,请等待同步完成或先填充内容');
  }

  const ranked = candidates
    .map((c) => ({ ...c, score: scoreSource(`${topic} ${audience}`, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, DRAFT_RECALL_K);

  if (ranked.length === 0) {
    throw new Error(`未在知识库找到与「${topic}」相关的素材`);
  }

  // 2. Read source bodies from KB mirror (web app reads /opt/kb in prod or
  //    ~/Workspace/songshu-knowledge-base in dev — same path as worker).
  const sourceBodies: Array<{ path: string; body: string }> = [];
  for (const r of ranked) {
    try {
      const body = await readFile(join(KB_ROOT, r.source_path), 'utf-8');
      // Trim each source to ~1500 chars to keep prompt within budget
      sourceBodies.push({ path: r.source_path, body: body.slice(0, 1500) });
    } catch (err) {
      console.warn(`[ai-draft] read source ${r.source_path} failed:`, err);
    }
  }
  if (sourceBodies.length === 0) {
    throw new Error('召回的素材文件读取失败,请检查知识库挂载');
  }

  // 3. Compose prompt
  const sourcesBlock = sourceBodies
    .map((s, i) => `## 素材 ${i + 1} 〈${s.path}〉\n${s.body}`)
    .join('\n\n---\n\n');
  const platformHint = PLATFORM_HINT[input.platform];

  const messages = [
    {
      role: 'system' as const,
      content:
        '你是一位严谨的医疗内容编辑。基于提供的医院真实知识库素材撰写草稿,严格事实准确,合规优先。' +
        '严禁使用绝对化表述(最好/第一/根治)、效果承诺(保证/100%)、夸大安全性(无痛/零风险)。' +
        '内容必须可溯源到提供的素材;不要凭空编数字或医生姓名。',
    },
    {
      role: 'user' as const,
      content:
        `# 写作任务\n\n` +
        `**主题**: ${topic}\n` +
        `**目标受众**: ${audience}\n` +
        `**平台**: ${input.platform}\n` +
        `**平台调性**: ${platformHint}\n\n` +
        `# 可用素材\n\n${sourcesBlock}\n\n` +
        `# 输出要求\n\n` +
        `严格输出 JSON,字段:\n` +
        `- title: 标题(吸引力强,15 字内)\n` +
        `- body: 正文 markdown(按平台调性,结构化)\n` +
        `- tactics: 应用的 GEO 技巧数组(从中选: cite_sources / add_statistics / authoritative / add_quotation)\n` +
        `- citations: 引用的素材路径数组(必须来自上面提供的素材路径,允许少于全部)\n`,
    },
  ];

  // 4. LLM call (or stub if ARK_API_KEY unset)
  let draftTitle = '';
  let draftBody = '';
  let draftCitations: string[] = [];
  let provider: 'doubao' | 'stub' = 'stub';

  if (llmAvailable()) {
    const result = await chat({
      messages,
      temperature: 0.7,
      max_tokens: 3000,
      response_format: 'json_object',
      timeout_ms: 90_000,
    });
    try {
      const parsed = JSON.parse(result.content) as {
        title?: string;
        body?: string;
        citations?: string[];
      };
      draftTitle = parsed.title ?? topic;
      draftBody = parsed.body ?? '';
      draftCitations = Array.isArray(parsed.citations)
        ? parsed.citations.filter((c) => sourceBodies.some((s) => s.path === c))
        : sourceBodies.map((s) => s.path);
      provider = 'doubao';
    } catch (err) {
      console.error('[ai-draft] LLM JSON parse failed', err, result.content.slice(0, 200));
      throw new Error('AI 返回格式异常,请重试');
    }
  } else {
    // Stub for dev without ARK_API_KEY — emit a placeholder so the rest of the flow stays testable.
    draftTitle = `[STUB] ${topic}`;
    draftBody =
      `> AI 草稿(stub 模式 — ARK_API_KEY 未配置)\n\n` +
      `主题: ${topic}\n受众: ${audience}\n平台: ${input.platform}\n\n` +
      `召回素材:\n${sourceBodies.map((s) => `- ${s.path}`).join('\n')}`;
    draftCitations = sourceBodies.map((s) => s.path);
  }

  if (!draftBody.trim()) throw new Error('AI 生成的正文为空,请重试');

  // 5. Persist content_item + citations
  const { data: created, error: insErr } = await supabase
    .from('content_items')
    .insert({
      tenant_id: tenant.id,
      title: draftTitle.slice(0, 200),
      source_type: 'manual',
      status: 'ai_drafted',
      markdown: draftBody,
      topics: [topic, audience].filter(Boolean),
    })
    .select('id')
    .single();
  if (insErr || !created) throw new Error(`草稿写入失败: ${insErr?.message}`);

  // Map citation paths back to knowledge_source ids
  const citedSources = ranked.filter((r) => draftCitations.includes(r.source_path));
  if (citedSources.length > 0) {
    await supabase.from('content_citations').insert(
      citedSources.map((c) => ({
        tenant_id: tenant.id,
        content_item_id: created.id,
        knowledge_source_id: c.id,
        confidence: c.score / Math.max(...ranked.map((r) => r.score)),
      })),
    );
  }

  console.log(
    `[ai-draft] tenant=${tenant.slug} topic="${topic}" provider=${provider} cited=${citedSources.length}/${ranked.length}`,
  );

  revalidatePath(`/t/${tenantSlug}/content`);
  return { content_item_id: created.id, cited_paths: citedSources.map((c) => c.source_path) };
}
