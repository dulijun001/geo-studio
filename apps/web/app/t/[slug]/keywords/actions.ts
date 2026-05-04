'use server';

import { revalidatePath } from 'next/cache';
import { chat, isAvailable as llmAvailable, scanKeywords, type KeywordRow } from '@geo/geo-core';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type KeywordIntent =
  | 'limit'
  | 'modifier'
  | 'core'
  | 'entity'
  | 'intent'
  | 'longtail';

const MAX_TEXT_LEN = 60;
const MAX_BATCH = 200;

function normalizeTerm(t: string): string {
  return t.trim().replace(/\s+/g, ' ');
}

/**
 * Run gate-1 keyword blacklist over each candidate. Returns the candidate
 * list partitioned into accepted (no hits) and rejected (has hits).
 *
 * D5/D12 — required before any AI-dug keyword can be persisted.
 */
async function filterByCompliance(
  tenantId: string,
  candidates: string[],
): Promise<{ accepted: string[]; rejected: { term: string; reason: string }[] }> {
  if (candidates.length === 0) return { accepted: [], rejected: [] };
  const service = getSupabaseServiceClient();
  const { data: kwRows } = await service
    .from('compliance_keywords')
    .select('id, term, level, category, variants, platforms');
  const blacklist = (kwRows ?? []) as KeywordRow[];

  const accepted: string[] = [];
  const rejected: { term: string; reason: string }[] = [];
  for (const cand of candidates) {
    const result = scanKeywords(cand, blacklist);
    if (result.hits.length > 0) {
      const reason = result.hits.map((h) => `命中"${h.term}"(${h.level})`).join(', ');
      rejected.push({ term: cand, reason });
    } else {
      accepted.push(cand);
    }
  }
  return { accepted, rejected };
}

// ─────────────────────────────────────────────────────────────────────
// Group CRUD
// ─────────────────────────────────────────────────────────────────────

export async function createGroup(
  tenantSlug: string,
  name: string,
  parentId: string | null,
): Promise<{ id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('请填写分组名称');
  if (trimmed.length > 40) throw new Error('分组名过长');
  const { data, error } = await service
    .from('keyword_groups')
    .insert({ tenant_id: tenant.id, name: trimmed, parent_id: parentId })
    .select('id')
    .single();
  if (error || !data) throw new Error(`创建分组失败: ${error?.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
  return { id: data.id as string };
}

export async function deleteGroup(
  tenantSlug: string,
  groupId: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('keyword_groups')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', groupId)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除失败: ${error.message}`);
  // Detach keywords from this group
  await service
    .from('keywords')
    .update({ group_id: null })
    .eq('group_id', groupId)
    .eq('tenant_id', tenant.id);
  revalidatePath(`/t/${tenantSlug}/keywords`);
}

// ─────────────────────────────────────────────────────────────────────
// Keyword inserts (3 modes)
// ─────────────────────────────────────────────────────────────────────

export type AddManualInput = {
  group_id: string | null;
  raw_text: string; // multi-line paste
};

export async function addKeywordsManual(
  tenantSlug: string,
  input: AddManualInput,
): Promise<{ inserted: number; skipped: number }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const lines = input.raw_text
    .split('\n')
    .map(normalizeTerm)
    .filter((s) => s && s.length <= MAX_TEXT_LEN);
  if (lines.length === 0) throw new Error('没有有效关键词');
  if (lines.length > MAX_BATCH) throw new Error(`一次最多 ${MAX_BATCH} 条`);

  const rows = lines.map((text) => ({
    tenant_id: tenant.id,
    group_id: input.group_id,
    text,
    source: 'manual' as const,
  }));
  const { data, error } = await service
    .from('keywords')
    .upsert(rows, { onConflict: 'tenant_id,text', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`保存失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
  return { inserted: data?.length ?? 0, skipped: lines.length - (data?.length ?? 0) };
}

export type CombineAxes = {
  group_id: string | null;
  /** Required core word axis. */
  core: string[];
  limit?: string[];
  modifier?: string[];
  entity?: string[];
  intent?: string[];
  longtail?: string[];
};

/**
 * 组合拓词 — 6-axis cartesian product. Order: limit + modifier + core + entity + intent + longtail.
 * Empty axes are skipped (not contributed to the product). Pure local computation, no LLM.
 */
export async function addKeywordsCombine(
  tenantSlug: string,
  input: CombineAxes,
): Promise<{ inserted: number; skipped: number; total: number }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const cores = (input.core ?? []).map(normalizeTerm).filter(Boolean);
  if (cores.length === 0) throw new Error('核心词为必填');

  const axes: Array<{ vals: string[] }> = [
    { vals: (input.limit ?? []).map(normalizeTerm).filter(Boolean) },
    { vals: (input.modifier ?? []).map(normalizeTerm).filter(Boolean) },
    { vals: cores },
    { vals: (input.entity ?? []).map(normalizeTerm).filter(Boolean) },
    { vals: (input.intent ?? []).map(normalizeTerm).filter(Boolean) },
    { vals: (input.longtail ?? []).map(normalizeTerm).filter(Boolean) },
  ];

  let combos: string[] = [''];
  for (const ax of axes) {
    if (ax.vals.length === 0) continue;
    const next: string[] = [];
    for (const prev of combos) {
      for (const v of ax.vals) next.push(prev + v);
    }
    combos = next;
  }
  combos = combos.map((c) => c.trim()).filter((c) => c && c.length <= MAX_TEXT_LEN);
  const total = combos.length;
  if (total === 0) throw new Error('组合结果为空');
  if (total > MAX_BATCH) throw new Error(`组合数 ${total} 超过 ${MAX_BATCH},请减少某些维度的词数`);

  const rows = combos.map((text) => ({
    tenant_id: tenant.id,
    group_id: input.group_id,
    text,
    source: 'combine' as const,
  }));
  const { data, error } = await service
    .from('keywords')
    .upsert(rows, { onConflict: 'tenant_id,text', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`保存失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
  return { inserted: data?.length ?? 0, skipped: total - (data?.length ?? 0), total };
}

export type DigInput = {
  seed: string;
};

export type DigResult = {
  candidates: string[];
  rejected: { term: string; reason: string }[];
  used_stub: boolean;
};

/**
 * AI 智能挖掘 — generate ~50 candidates from a seed core word via doubao,
 * filter through compliance gate-1, return survivors as preview list.
 *
 * NOTE: This DOES NOT auto-insert. UI shows the candidates, user picks
 * which ones to save via `saveDugKeywords`.
 */
export async function digKeywords(
  tenantSlug: string,
  input: DigInput,
): Promise<DigResult> {
  await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const seed = normalizeTerm(input.seed);
  if (!seed) throw new Error('请填写核心词');

  let raw: string[] = [];
  let used_stub = false;

  if (llmAvailable()) {
    const { content } = await chat({
      messages: [
        {
          role: 'system',
          content:
            '你是 SEO/GEO 关键词专家。给定一个核心词,产出 50 个相关的长尾搜索词,覆盖价格、流程、对比、风险、城市、人群等不同意图维度。' +
            '严格返回 JSON: {"candidates": ["...", ...]}。每条不超过 30 字。禁止使用医疗绝对化用语(治愈/根治/最好/第一)。',
        },
        { role: 'user', content: `核心词: ${seed}` },
      ],
      response_format: 'json_object',
      temperature: 0.7,
      timeout_ms: 30_000,
    });
    try {
      const parsed = JSON.parse(content) as { candidates?: unknown };
      if (Array.isArray(parsed.candidates)) {
        raw = parsed.candidates
          .filter((x): x is string => typeof x === 'string')
          .map(normalizeTerm)
          .filter((s) => s.length > 0 && s.length <= MAX_TEXT_LEN);
      }
    } catch {
      throw new Error('AI 返回格式异常,请重试');
    }
  } else {
    // stub 模式 — 让本地开发也能跑通流程
    used_stub = true;
    raw = [
      `${seed}价格`,
      `${seed}怎么选`,
      `${seed}流程`,
      `${seed}多少钱`,
      `${seed}注意事项`,
      `${seed}对比`,
      `${seed}哪家好`,
      `${seed}医保报销`,
      `${seed}术后护理`,
      `${seed}风险`,
    ];
  }

  // Dedup
  raw = Array.from(new Set(raw));

  // Compliance gate 1
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const { accepted, rejected } = await filterByCompliance(tenant.id, raw);
  return { candidates: accepted, rejected, used_stub };
}

export async function saveDugKeywords(
  tenantSlug: string,
  groupId: string | null,
  terms: string[],
): Promise<{ inserted: number; skipped: number }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const cleaned = terms
    .map(normalizeTerm)
    .filter((s) => s && s.length <= MAX_TEXT_LEN);
  if (cleaned.length === 0) throw new Error('未选择关键词');

  // Belt-and-braces: re-run gate-1 even though dig already filtered.
  const { accepted } = await filterByCompliance(tenant.id, cleaned);
  if (accepted.length === 0) throw new Error('全部命中合规黑名单,无法保存');

  const rows = accepted.map((text) => ({
    tenant_id: tenant.id,
    group_id: groupId,
    text,
    source: 'ai_dig' as const,
  }));
  const { data, error } = await service
    .from('keywords')
    .upsert(rows, { onConflict: 'tenant_id,text', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`保存失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
  return { inserted: data?.length ?? 0, skipped: cleaned.length - (data?.length ?? 0) };
}

// ─────────────────────────────────────────────────────────────────────
// Bulk ops
// ─────────────────────────────────────────────────────────────────────

export async function moveKeywords(
  tenantSlug: string,
  ids: string[],
  newGroupId: string | null,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  if (ids.length === 0) return;
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('keywords')
    .update({ group_id: newGroupId, updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`移动失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
}

export async function deleteKeywords(
  tenantSlug: string,
  ids: string[],
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  if (ids.length === 0) return;
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('keywords')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
}
