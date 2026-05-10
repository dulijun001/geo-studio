/**
 * V1.9 — Citation discovery (LLM-recommended).
 *
 * Workflow:
 *   1. discoverCitationCandidates(slug, { topic? })
 *      → LLM picks 5-10 authoritative sources for the tenant's industry,
 *        extracts 3-5 ground-truth key_claims per source.
 *      → Returns Candidate[] (NOT inserted yet — operator reviews first).
 *   2. bulkInsertCitations(slug, accepted[])
 *      → Insert reviewed candidates as verified_citations rows.
 *
 * The discovery step is intentionally LLM-only (no web fetch). Reasons:
 *   - Avoids robots.txt / encoding / dynamic-content rabbit hole
 *   - Avoids legal grey area of bulk-fetching authoritative .gov / journal
 *     sites
 *   - LLM training data is sufficient for citation discovery on well-known
 *     domains; the human reviewer is the trust anchor (D5 four-gate
 *     compliance principle)
 *
 * Risk controls:
 *   - Operator MUST review each candidate before insert (UI gates this)
 *   - Existing dedup: title-by-title check on insert
 *   - Existing schema enforcement: source_type enum, year range, url scheme
 */
'use server';

import { revalidatePath } from 'next/cache';
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { requireRole } from '@/lib/tenant';
import { getCurrentUser } from '@/lib/current-user';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type DiscoveredCandidate = {
  title: string;
  source_type: 'guideline' | 'industry_standard' | 'official_document' | 'textbook' | 'research_paper' | 'other';
  issuer: string;
  publication_year: number | null;
  url?: string;
  /** Why this source is authoritative — shown to operator during review. */
  rationale: string;
  /** Ground-truth data points from the source, used by C1 numeric-fact judge. */
  key_claims: string[];
};

const MAX_CANDIDATES = 10;

const SYSTEM_PROMPT = `你是医疗内容合规专家。给定行业,推荐该行业写作时**最权威**的引用源(国家级指南 / 学会标准 / 官方政府文件 / 主流学术著作)。

## 硬约束

1. **真实存在**:只推荐真实存在的指南/文件,你绝不允许编造("听起来像但不存在的指南"——直接拒绝输出)
2. **权威等级**:优先级 国家卫健委文件 > 国家级学会指南 > 医保局/疾控目录 > 国际权威(WHO/CDC/ITI 等) > 主流学术著作
3. **key_claims 是真实数据点**:从原文里能精确引用的"数字 / 比例 / 临床判断"。例如"种植体 5 年存活率 92-98%"。**不要**写主观结论或转述
4. **不确定就不写**:如果你对某条 key_claim 的具体数字记忆不清,直接删掉,宁缺勿滥
5. **覆盖面**:推荐的 ${MAX_CANDIDATES} 条尽量覆盖该行业不同子领域

## 输出格式(严格 JSON)

{
  "candidates": [
    {
      "title": "《XX 指南》",
      "source_type": "guideline" | "industry_standard" | "official_document" | "textbook" | "research_paper",
      "issuer": "发布机构(如:中华口腔医学会)",
      "publication_year": 2023,
      "url": "可选,只有你确信的官方 URL",
      "rationale": "为什么这是权威源(1 句话)",
      "key_claims": [
        "原文具体陈述 1(含数字/比例)",
        "原文具体陈述 2",
        "原文具体陈述 3"
      ]
    },
    ...
  ]
}`;

export async function discoverCitationCandidates(
  tenantSlug: string,
  input: { topic?: string },
): Promise<{ candidates: DiscoveredCandidate[] }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  if (!llmAvailable()) {
    throw new Error('LLM 不可用(ARK_API_KEY 未配置)');
  }

  const userPrompt =
    `# 行业\n${tenant.industry}\n\n` +
    (input.topic?.trim()
      ? `# 优先关注主题\n${input.topic.trim()}\n\n推荐时,涉及该主题的引用源排在前面。\n\n`
      : '') +
    `# 任务\n推荐 ${MAX_CANDIDATES} 个最权威的引用源,每个 3-5 条 key_claims。\n\n` +
    `已有的源(避免重复):见 verified_citations 表(LLM 不可访问,你按行业常识避开常见 8 项即可)。`;

  // Use the non-reasoning Pro model (NOT the team's default ep-m-* reasoning
  // endpoint). For citation discovery we don't need chain-of-thought — and
  // the reasoning model burns 10K+ tokens of internal CoT per call which
  // pushes wall-clock past the 2-min server-action ceiling.
  let result;
  try {
    result = await chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model: 'doubao-1-5-pro-32k-250115',
      temperature: 0.3, // 低温度 — 推荐权威源不需要创意
      max_tokens: 3000,
      response_format: 'json_object',
      timeout_ms: 90_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) {
      throw new Error('豆包响应超过 90 秒,可能负载过高,请稍后重试');
    }
    throw new Error(`豆包调用失败: ${msg.slice(0, 150)}`);
  }

  let parsed: { candidates?: DiscoveredCandidate[] };
  try {
    parsed = JSON.parse(result.content) as { candidates?: DiscoveredCandidate[] };
  } catch {
    throw new Error('豆包返回格式异常,请重试');
  }
  const candidates = (parsed.candidates ?? [])
    .filter((c): c is DiscoveredCandidate => Boolean(c?.title && c?.issuer))
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    throw new Error('LLM 未推荐任何候选,请换主题或重试');
  }

  return { candidates };
}

/**
 * Bulk-insert reviewed candidates. Skips ones whose title already exists
 * (case-insensitive). Returns counts.
 */
export async function bulkInsertCitations(
  tenantSlug: string,
  candidates: DiscoveredCandidate[],
): Promise<{ inserted: number; skipped: string[] }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  if (!candidates.length) throw new Error('请至少选 1 条入库');
  if (candidates.length > MAX_CANDIDATES) throw new Error(`一次最多 ${MAX_CANDIDATES} 条`);

  const user = await getCurrentUser();
  const service = getSupabaseServiceClient();

  // Pull existing titles for dedup check
  const { data: existing } = await service
    .from('verified_citations')
    .select('title')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const existingTitles = new Set(
    ((existing ?? []) as Array<{ title: string }>).map((r) => r.title.toLowerCase().trim()),
  );

  const skipped: string[] = [];
  const toInsert: Array<Record<string, unknown>> = [];
  for (const c of candidates) {
    const title = c.title.trim();
    if (!title) continue;
    if (existingTitles.has(title.toLowerCase())) {
      skipped.push(title);
      continue;
    }
    const url = (c.url ?? '').trim();
    toInsert.push({
      tenant_id: tenant.id,
      title: title.slice(0, 200),
      title_aliases: [],
      source_type: c.source_type,
      issuer: (c.issuer ?? '').trim().slice(0, 200),
      publication_year:
        typeof c.publication_year === 'number' && c.publication_year >= 1900 && c.publication_year <= new Date().getFullYear() + 1
          ? c.publication_year
          : null,
      url: url && /^https?:\/\/.+/.test(url) ? url : '',
      notes: (c.rationale ?? '').slice(0, 500),
      key_claims: (c.key_claims ?? [])
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 240)
        .slice(0, 30),
      active: true,
      verified_by_user_id: user?.id ?? null,
      verified_at: new Date().toISOString(),
    });
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const { data: rows, error } = await service
      .from('verified_citations')
      .insert(toInsert)
      .select('id');
    if (error) throw new Error(`入库失败: ${error.message}`);
    inserted = rows?.length ?? 0;
  }

  revalidatePath(`/t/${tenantSlug}/citations`);
  return { inserted, skipped };
}
