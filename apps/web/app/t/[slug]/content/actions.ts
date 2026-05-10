'use server';

import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { PLATFORM_HINT } from '@geo/shared';
import { runAiDraft, type RunAiDraftInput, type RunAiDraftResult } from '@/lib/ai-draft-core';
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
// AI draft (V1.5-8 → V1.9 batch)
//
// Synchronous RAG draft generation. Server action wraps requireRole +
// revalidate; pure work (KB recall, LLM, insert) lives in @/lib/ai-draft-core
// so the batch worker job can call the same logic via /api/internal/ai-draft.
// ============================================================================

export type CreateAiDraftInput = RunAiDraftInput;
export type CreateAiDraftResult = RunAiDraftResult;

export async function createAiDraft(
  tenantSlug: string,
  input: CreateAiDraftInput,
): Promise<CreateAiDraftResult> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();
  const result = await runAiDraft(supabase, tenant.id, input);
  revalidatePath(`/t/${tenantSlug}/content`);
  return result;
}

// ============================================================================
// Query → content matrix (V1.6-5)
//
// Reverse the workflow: instead of "I want to write topic X", ask "users on
// Doubao are searching Q — what content matrix maximizes our chance of being
// cited?". LLM proposes 5-7 ideas across the P2-P4 tiers, each with a
// platform / title / angle / suggested doctor. Admin clicks "生成此条" on the
// ones they like to spawn createAiDraft jobs.
// ============================================================================

export type MatrixIdea = {
  platform: CreateAiDraftInput['platform'];
  tier: 'P2' | 'P3' | 'P4';
  title: string;
  angle: string;
  recommended_doctor: string | null;
};

export type ProposeMatrixResult = {
  query: string;
  audience: string;
  ideas: MatrixIdea[];
};

const PLATFORM_TIER: Record<CreateAiDraftInput['platform'], 'P2' | 'P3' | 'P4'> = {
  wechat_mp: 'P2',
  zhihu: 'P2',
  toutiao_article: 'P2',
  douyin_script: 'P3',
  xiaohongshu: 'P4',
};

const VALID_PLATFORMS: ReadonlyArray<CreateAiDraftInput['platform']> = [
  'wechat_mp',
  'zhihu',
  'toutiao_article',
  'douyin_script',
  'xiaohongshu',
];

export type ProposeMatrixInput = {
  query: string;
  audience: string;
};

export async function proposeContentMatrix(
  tenantSlug: string,
  input: ProposeMatrixInput,
): Promise<ProposeMatrixResult> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const query = input.query.trim();
  const audience = input.audience.trim();
  if (query.length < 4) throw new Error('查询语句至少 4 字');
  if (audience.length === 0) throw new Error('请选择受众');

  const supabase = createSupabaseServerClient();
  // Load doctor names so LLM picks from real staff
  const { data: doctors } = await supabase
    .from('brand_vocab')
    .select('term, aliases')
    .eq('tenant_id', tenant.id)
    .eq('term_type', 'doctor')
    .is('deleted_at', null)
    .limit(20);
  const doctorNames = ((doctors ?? []) as Array<{ term: string }>).map((d) => d.term);

  const messages = [
    {
      role: 'system' as const,
      content:
        '你是 GEO(生成式引擎优化)内容策略专家。用户告诉你他们想"出现在豆包搜索某 query 的答案里",你设计内容矩阵。' +
        '\n\n## 矩阵要求\n' +
        '6-7 条内容,覆盖 P2-P4 三个层级:\n' +
        '- P2(必有):公众号 wechat_mp 1 条 + 知乎 zhihu 1 条 + 头条号 toutiao_article 1 条 — 长文 + 权威 + 专业\n' +
        '- P3(必有):抖音脚本 douyin_script 至少 2 条,不同医生分别口播 — 字节系强加分\n' +
        '- P4(可选):小红书 xiaohongshu 1-2 条 — 痛点 + 个人化\n' +
        '\n## 角度要求\n' +
        '不同 platform 切入角度必须不同(避免雷同):权威数据 / 案例故事 / 视觉化 60s 钩子 / 患者痛点 / 价格透明度 / 医生 IP / ...' +
        '\n\n## 输出格式\n' +
        '严格 JSON: { "ideas": [ { "platform": "...", "title": "标题15字内", "angle": "切入角度1-2句", "recommended_doctor": "医生名" } ] }\n' +
        'platform 必须是: wechat_mp / zhihu / toutiao_article / douyin_script / xiaohongshu' +
        (doctorNames.length > 0
          ? `\n推荐医生从以下选: ${doctorNames.join(', ')}`
          : '\nrecommended_doctor 字段填 null'),
    },
    {
      role: 'user' as const,
      content:
        `# 豆包搜索 query\n${query}\n\n` +
        `# 目标受众\n${audience}\n\n` +
        `请基于 query + 受众,设计内容矩阵。`,
    },
  ];

  if (!llmAvailable()) {
    // Stub matrix for dev without ARK_API_KEY
    return {
      query,
      audience,
      ideas: [
        { platform: 'wechat_mp', tier: 'P2', title: `[STUB] ${query} 深度科普`, angle: '权威引用 + 数据', recommended_doctor: doctorNames[0] ?? null },
        { platform: 'zhihu', tier: 'P2', title: `[STUB] ${query} 知乎回答`, angle: '专家长文 + 案例', recommended_doctor: doctorNames[1] ?? null },
        { platform: 'douyin_script', tier: 'P3', title: `[STUB] 60s 视频`, angle: '钩子 + 视觉化', recommended_doctor: doctorNames[2] ?? null },
      ],
    };
  }

  let parsed: { ideas?: Array<Partial<MatrixIdea>> };
  try {
    const result = await chat({
      messages,
      temperature: 0.7,
      max_tokens: 1500,
      response_format: 'json_object',
      timeout_ms: 90_000,
    });
    parsed = JSON.parse(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) {
      throw new Error('AI 超时未返回(>90s),请稍后重试');
    }
    throw new Error(`AI 调用失败: ${msg.slice(0, 100)}`);
  }

  const ideas: MatrixIdea[] = (parsed.ideas ?? [])
    .filter(
      (i): i is MatrixIdea =>
        typeof i.platform === 'string' &&
        (VALID_PLATFORMS as readonly string[]).includes(i.platform) &&
        typeof i.title === 'string' &&
        i.title.length > 0,
    )
    .map((i) => ({
      platform: i.platform,
      tier: PLATFORM_TIER[i.platform],
      title: i.title.slice(0, 50),
      angle: (i.angle ?? '').slice(0, 200),
      recommended_doctor: i.recommended_doctor ?? null,
    }));

  if (ideas.length === 0) {
    throw new Error('AI 没产出有效建议,请尝试更具体的 query');
  }

  console.log(`[matrix] tenant=${tenant.slug} query="${query}" ideas=${ideas.length}`);
  return { query, audience, ideas };
}
