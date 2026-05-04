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
  /** ADR 007 — optional intent skeleton from writing_templates table. */
  writing_template_id?: string | null;
  /** ADR 007 — optional list of keyword ids to plant into the body. */
  keyword_ids?: string[];
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
 * Platforms with a customer-maintained style guide in the KB. Loaded at draft
 * time and injected into the prompt — keeps tone evolution in the customer's
 * hands, no code redeploy needed.
 */
const PLATFORM_KB_GUIDE: Partial<Record<CreateAiDraftInput['platform'], string>> = {
  xiaohongshu: '营销/渠道/小红书/风格指南.md',
  douyin_script: '营销/渠道/抖音/风格指南.md',
};

/**
 * GEO tactics ordered by lift weight (Aggarwal 2023 + W6.0 doubao probes).
 * Injected verbatim into every draft prompt so the LLM knows what to optimize.
 */
const GEO_TACTICS_PROMPT = `# GEO 优化 9 法(按引用率提升权重排序,优先应用前 5 条)

1. **加权威引用**(+41%):明确引用论文/临床指南/行业标准(如《ITI 共识》《医疗广告法》)
2. **加统计数据**(+33%):具体数字 / 比例 / 临床研究(避免"很多""不少"等模糊词)
3. **加专家署名**(+28%):必须引用素材中提供的真实医生姓名 + 资质 + 专长
4. **加结构化标题**(+25%):清晰的一二三 + 子标题层级
5. **加流畅度优化**(+22%):去除机器味,用自然语言
6. **加直接引语**(+18%):"《XX 指南》指出..." 直引
7. **加解释性**(+15%):"为什么这样做" 因果链
8. **加叙事**(+12%):案例故事化引入
9. **加列表**(+8%):3 步 / 5 要点 listicle`;

const SYSTEM_PROMPT = `你是一位严谨的医疗内容编辑。基于提供的医院真实知识库素材撰写草稿,目标是被豆包/元宝/DeepSeek 等 AI 引擎倾向引用,同时合规、真实、可溯源。

## 硬约束(必须遵守,违反一条全文重写)

1. **合规底线**:严禁绝对化用语(最/第一/根治/包治/治愈)、效果承诺(保证/100%/无效退款/永久)、安全性夸大(无痛/零风险/绝对安全/无并发症)、违规比较(比XX好/碾压同行)
2. **零幻觉**:严禁编造数字 / 年限 / 医生姓名。素材没提供的数据 → 不要写。素材没提供的医生 → 不要署名。如必须给数字,只能引用素材里出现过的
3. **必须引用真实医生**:从提供的素材中至少引用 1 位真实医生姓名 + 该医生的资质 / 专长 / 案例(GEO 加专家署名 +28%)
4. **citations 必须返回**:在 JSON 的 citations 字段列出实际引用到的素材 path,不可为空数组`;

/**
 * N-gram substring recall — minimal viable RAG for Chinese without a tokenizer.
 *
 * Chinese has no spaces, so word-level tokens don't work. Generate 2-gram and
 * 3-gram substrings of the query, check substring containment in title/excerpt.
 * 3-grams score higher (more semantic). For "糖尿病人能种牙吗" this generates
 * 糖尿/尿病/病人/...种牙/牙吗 + 糖尿病/...种牙吗 — "糖尿病" 3-gram matches md
 * mentioning 糖尿病 in title or excerpt.
 *
 * V2: pgvector embeddings or a Chinese tokenizer (jieba-wasm).
 */
function ngrams(s: string, n: number): string[] {
  const cleaned = s.replace(/[\s，。！？、:：；,.!?;()（）【】「」"""'']/g, '');
  const out: string[] = [];
  for (let i = 0; i + n <= cleaned.length; i++) {
    out.push(cleaned.slice(i, i + n));
  }
  return out;
}

function scoreSource(
  query: string,
  source: { title: string | null; excerpt: string | null; source_path: string },
): number {
  const grams = Array.from(new Set([...ngrams(query, 2), ...ngrams(query, 3)]));
  if (grams.length === 0) return 0;
  const title = source.title ?? '';
  const excerpt = source.excerpt ?? '';
  const path = source.source_path;
  let score = 0;
  for (const g of grams) {
    const inPath = path.includes(g);
    const inTitle = title.includes(g);
    const inExcerpt = excerpt.includes(g);
    if (g.length === 3) {
      if (inPath) score += 6;
      if (inTitle) score += 5;
      if (inExcerpt) score += 2;
    } else {
      if (inPath) score += 3;
      if (inTitle) score += 2;
      if (inExcerpt) score += 1;
    }
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
    // Surface real candidate titles from this tenant's KB so the suggestions
    // match what the user actually has — no hardcoded example keywords.
    const samples = candidates
      .filter((c) => c.title)
      .slice(0, 6)
      .map((c) => `「${c.title}」`)
      .join('、');
    const suggestion = samples
      ? `你知识库里现有这些素材标题:${samples}。试试用其中一个的关键词,或精简成 2-4 字的主题词(如其中的核心名词)。`
      : '请先到「设置 → 知识库」上传相关 markdown 素材,再回来生成内容。';
    throw new Error(
      `知识库里 ${candidates.length} 篇内没有匹配「${topic}」的素材。${suggestion}`,
    );
  }

  // 2. Read source bodies from KB mirror (web app reads /opt/kb in prod or
  //    ~/Workspace/songshu-knowledge-base in dev — same path as worker).
  const sourceBodies: Array<{ path: string; body: string }> = [];
  for (const r of ranked) {
    try {
      const body = await readFile(join(KB_ROOT, r.source_path), 'utf-8');
      // Trim to 1000 chars/source — total prompt budget ~5K excluding system
      // (5 sources × 1000 + style guide 1500 + tactics 700 + system 800 ≈ 8K)
      sourceBodies.push({ path: r.source_path, body: body.slice(0, 1000) });
    } catch (err) {
      console.warn(`[ai-draft] read source ${r.source_path} failed:`, err);
    }
  }
  if (sourceBodies.length === 0) {
    throw new Error('召回的素材文件读取失败,请检查知识库挂载');
  }

  // 3a. Load platform style guide from KB (if customer maintains one)
  let platformGuide: string | null = null;
  const guidePath = PLATFORM_KB_GUIDE[input.platform];
  if (guidePath) {
    try {
      const raw = await readFile(join(KB_ROOT, guidePath), 'utf-8');
      // Strip frontmatter + ## 元信息 section to save tokens
      const stripped = raw
        .replace(/^---[\s\S]*?---\s*/m, '')
        .replace(/##\s*元信息[\s\S]*?(?=##|\z)/m, '');
      platformGuide = stripped.slice(0, 1500);
    } catch (err) {
      console.warn(`[ai-draft] platform guide ${guidePath} unavailable:`, err);
    }
  }

  // 3b. ADR 007 — load writing template + keywords if provided
  let templateBlock = '';
  let templateSystemAppend = '';
  let keywordsBlock = '';

  if (input.writing_template_id || (input.keyword_ids && input.keyword_ids.length > 0)) {
    const tplPromise = input.writing_template_id
      ? supabase
          .from('writing_templates')
          .select('name, prompt_skeleton, structure_hint')
          .eq('id', input.writing_template_id)
          .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null });
    const kwPromise = input.keyword_ids && input.keyword_ids.length > 0
      ? supabase
          .from('keywords')
          .select('text')
          .in('id', input.keyword_ids)
          .eq('tenant_id', tenant.id)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] });
    const [tplRes, kwRes] = await Promise.all([tplPromise, kwPromise]);

    if (tplRes.data) {
      const tpl = tplRes.data as { name: string; prompt_skeleton: string; structure_hint: { sections?: string[]; min_sections?: number } | null };
      templateSystemAppend = `\n\n${tpl.prompt_skeleton}`;
      const sections = tpl.structure_hint?.sections ?? [];
      if (sections.length > 0) {
        templateBlock =
          `\n\n# 文章骨架(来自写作要求"${tpl.name}",作为结构参考可微调)\n` +
          sections.map((s, i) => `${i + 1}. ${s}`).join('\n') +
          (tpl.structure_hint?.min_sections
            ? `\n\n至少包含 ${tpl.structure_hint.min_sections} 个上述节段。`
            : '');
      }
    }

    const keywordTexts = ((kwRes.data ?? []) as Array<{ text: string }>).map((k) => k.text);
    if (keywordTexts.length > 0) {
      keywordsBlock =
        `\n\n# 必须自然植入的关键词(每个至少出现一次,禁止堆砌列表)\n` +
        keywordTexts.map((k) => `• ${k}`).join('\n') +
        `\n\n注意:每个关键词必须以**自然语境**出现,不要集中堆在末尾或 tag 区。`;
    }
  }

  // 3c. Compose prompt
  const sourcesBlock = sourceBodies
    .map((s, i) => `## 素材 ${i + 1} 〈${s.path}〉\n${s.body}`)
    .join('\n\n---\n\n');
  const platformHint = PLATFORM_HINT[input.platform];
  const platformBlock = platformGuide
    ? `# 平台调性(客户维护的风格指南 〈${guidePath}〉)\n\n${platformGuide}`
    : `# 平台调性\n\n${platformHint}`;

  // ADR 007 — SYSTEM_PROMPT (compliance + zero-hallucination, IMMUTABLE) comes
  // FIRST. Template skeleton is appended after, so a malicious template can't
  // override the red lines.
  const systemContent = SYSTEM_PROMPT + templateSystemAppend;

  const messages = [
    { role: 'system' as const, content: systemContent },
    {
      role: 'user' as const,
      content:
        `# 写作任务\n\n` +
        `**主题**: ${topic}\n` +
        `**目标受众**: ${audience}\n` +
        `**目标平台**: ${input.platform}\n\n` +
        `${platformBlock}\n\n` +
        `${GEO_TACTICS_PROMPT}` +
        `${templateBlock}` +
        `${keywordsBlock}\n\n` +
        `# 可用素材(只能引用以下内容,严禁外部知识)\n\n${sourcesBlock}\n\n` +
        `# 输出要求\n\n` +
        `严格输出 JSON,字段:\n` +
        `- title: 标题(吸引力强,15 字内)\n` +
        `- body: 正文 markdown(按平台调性结构化,优先应用 GEO 9 法前 5 条)\n` +
        `- tactics: 应用的 GEO 技巧数组(从 9 法中选实际用到的)\n` +
        `- citations: 引用的素材路径数组(从上面素材路径中选,**至少 1 条**;路径必须完全匹配,不要修改)\n` +
        `- doctors_cited: 文中提到的真实医生姓名数组(必须来自素材,**至少 1 位**)\n`,
    },
  ];

  // 4. LLM call (or stub if ARK_API_KEY unset)
  let draftTitle = '';
  let draftBody = '';
  let draftCitations: string[] = [];
  let provider: 'doubao' | 'stub' = 'stub';

  if (llmAvailable()) {
    let result;
    try {
      result = await chat({
        messages,
        temperature: 0.7,
        max_tokens: 2500,
        response_format: 'json_object',
        timeout_ms: 180_000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort/i.test(msg)) {
        throw new Error('AI 生成超过 3 分钟未返回。可能负载过高,请稍后重试或换更具体的主题');
      }
      console.error('[ai-draft] LLM call failed:', err);
      throw new Error(`AI 调用失败: ${msg.slice(0, 100)}`);
    }
    try {
      const parsed = JSON.parse(result.content) as {
        title?: string;
        body?: string;
        citations?: string[];
        doctors_cited?: string[];
      };
      draftTitle = parsed.title ?? topic;
      draftBody = parsed.body ?? '';
      // Validate citations strictly; if none match, fall back to all recalled
      // sources so the back-reference chain (V1.8 attribution) never breaks.
      const validCitations = Array.isArray(parsed.citations)
        ? parsed.citations.filter((c) => sourceBodies.some((s) => s.path === c))
        : [];
      if (validCitations.length === 0) {
        console.warn(
          `[ai-draft] LLM returned 0 valid citations (raw=${JSON.stringify(parsed.citations)?.slice(0, 200)}), falling back to all recalled sources`,
        );
        draftCitations = sourceBodies.map((s) => s.path);
      } else {
        draftCitations = validCitations;
      }
      if (Array.isArray(parsed.doctors_cited) && parsed.doctors_cited.length > 0) {
        console.log(`[ai-draft] doctors cited: ${parsed.doctors_cited.join(', ')}`);
      } else {
        console.warn(`[ai-draft] LLM did not cite any doctor — GEO 专家署名 lift lost`);
      }
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

  // 5. Persist content_item + citations (ADR 007 — also stash template + kw refs)
  const { data: created, error: insErr } = await supabase
    .from('content_items')
    .insert({
      tenant_id: tenant.id,
      title: draftTitle.slice(0, 200),
      source_type: 'manual',
      status: 'ai_drafted',
      markdown: draftBody,
      topics: [topic, audience].filter(Boolean),
      writing_template_id: input.writing_template_id ?? null,
      keyword_ids: input.keyword_ids ?? [],
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
