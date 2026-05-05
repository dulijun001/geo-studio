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
 * Filter `texts` against existing live (deleted_at IS NULL) keywords for this tenant.
 *
 * Why not use Supabase `.upsert({ onConflict: 'tenant_id,text' })`?
 * The unique index in 0024 is partial (`WHERE deleted_at IS NULL`) to allow
 * soft-deleted rows to coexist with re-added ones. Postgres requires ON CONFLICT
 * to match a real unique constraint, not a partial index — Supabase JS client
 * doesn't support specifying the index predicate. So we de-dup in app code.
 */
async function partitionExisting(
  tenantId: string,
  texts: string[],
): Promise<{ fresh: string[]; existing: string[] }> {
  if (texts.length === 0) return { fresh: [], existing: [] };
  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from('keywords')
    .select('text')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('text', texts);
  if (error) throw new Error(`查重失败: ${error.message}`);
  const taken = new Set((data ?? []).map((r) => r.text as string));
  const fresh: string[] = [];
  const existing: string[] = [];
  for (const t of texts) (taken.has(t) ? existing : fresh).push(t);
  return { fresh, existing };
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

  // KW-1 — pre-check for same-name collision under same parent. Migration
  // 0024 has a partial unique index on (tenant_id, COALESCE(parent_id, ...),
  // name) WHERE deleted_at IS NULL, but Supabase JS upsert can't target a
  // partial index, and a raw insert returns a verbose Postgres error. Pre-
  // SELECT gives the user a clear message + race-window narrowed.
  // Supabase JS uses .is() for NULL equality and .eq() for value equality —
  // they cannot be unified into one expression, so we branch.
  const collisionQ = parentId === null
    ? service.from('keyword_groups').select('id').eq('tenant_id', tenant.id).eq('name', trimmed).is('parent_id', null).is('deleted_at', null)
    : service.from('keyword_groups').select('id').eq('tenant_id', tenant.id).eq('name', trimmed).eq('parent_id', parentId).is('deleted_at', null);
  const { data: existing, error: cErr } = await collisionQ;
  if (cErr) throw new Error(`分组查重失败: ${cErr.message}`);
  if ((existing ?? []).length > 0) {
    const where = parentId ? '该父分组下' : '顶层';
    throw new Error(`${where}已存在同名分组「${trimmed}」,请换一个名字或挂在其他父分组下`);
  }

  const { data, error } = await service
    .from('keyword_groups')
    .insert({ tenant_id: tenant.id, name: trimmed, parent_id: parentId })
    .select('id')
    .single();
  if (error || !data) throw new Error(`创建分组失败: ${error?.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
  return { id: data.id as string };
}

/**
 * KW-3 — rename a group in place, preserving keyword associations.
 * Re-runs same-parent collision check.
 */
export async function renameGroup(
  tenantSlug: string,
  groupId: string,
  newName: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('请填写新名称');
  if (trimmed.length > 40) throw new Error('分组名过长');

  const { data: current } = await service
    .from('keyword_groups')
    .select('id, name, parent_id')
    .eq('id', groupId)
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!current) throw new Error('分组不存在');
  if (current.name === trimmed) return; // no-op

  // Same-parent collision check (excluding self).
  const parentId = current.parent_id as string | null;
  const verifyQ = parentId === null
    ? service.from('keyword_groups').select('id').eq('tenant_id', tenant.id).eq('name', trimmed).is('parent_id', null).is('deleted_at', null).neq('id', groupId)
    : service.from('keyword_groups').select('id').eq('tenant_id', tenant.id).eq('name', trimmed).eq('parent_id', parentId).is('deleted_at', null).neq('id', groupId);
  const { data: dup } = await verifyQ;
  if ((dup ?? []).length > 0) {
    throw new Error(`已有同名分组「${trimmed}」,无法重命名`);
  }

  const { error } = await service
    .from('keyword_groups')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', groupId)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`重命名失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
}

/**
 * KW-2 — query a group's "blast radius" so the UI can warn before deletion.
 * Returns child group count + (live) keyword count.
 */
export async function getGroupImpact(
  tenantSlug: string,
  groupId: string,
): Promise<{ child_groups: number; keywords: number }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    service
      .from('keyword_groups')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('parent_id', groupId)
      .is('deleted_at', null),
    service
      .from('keywords')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('group_id', groupId)
      .is('deleted_at', null),
  ]);
  return { child_groups: c1 ?? 0, keywords: c2 ?? 0 };
}

export async function deleteGroup(
  tenantSlug: string,
  groupId: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();
  const now = new Date().toISOString();

  // KW-2 — pseudo-atomic two-phase delete with rollback on detach failure.
  // Supabase JS doesn't expose multi-statement transactions; we compensate
  // manually so a half-deleted state can't leave keyword rows pointing at
  // a soft-deleted group (where they'd silently disappear from "未分组" UI
  // because the JOIN drops the deleted group).
  const { error: delErr } = await service
    .from('keyword_groups')
    .update({ deleted_at: now })
    .eq('id', groupId)
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null); // Avoid double-soft-delete races.
  if (delErr) throw new Error(`删除失败: ${delErr.message}`);

  const { error: detachErr } = await service
    .from('keywords')
    .update({ group_id: null })
    .eq('group_id', groupId)
    .eq('tenant_id', tenant.id);

  if (detachErr) {
    // Compensate: undo the soft-delete so we don't end with orphans.
    await service
      .from('keyword_groups')
      .update({ deleted_at: null })
      .eq('id', groupId)
      .eq('tenant_id', tenant.id);
    throw new Error(`关键词解绑失败,删除已回滚: ${detachErr.message}`);
  }

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

  const deduped = Array.from(new Set(lines));
  const { fresh } = await partitionExisting(tenant.id, deduped);
  if (fresh.length === 0) {
    return { inserted: 0, skipped: deduped.length };
  }
  const rows = fresh.map((text) => ({
    tenant_id: tenant.id,
    group_id: input.group_id,
    text,
    source: 'manual' as const,
  }));
  const { data, error } = await service.from('keywords').insert(rows).select('id');
  if (error) throw new Error(`保存失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/keywords`);
  return { inserted: data?.length ?? 0, skipped: deduped.length - (data?.length ?? 0) };
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

  const deduped = Array.from(new Set(combos));
  const { fresh } = await partitionExisting(tenant.id, deduped);
  if (fresh.length === 0) {
    return { inserted: 0, skipped: deduped.length, total };
  }
  const rows = fresh.map((text) => ({
    tenant_id: tenant.id,
    group_id: input.group_id,
    text,
    source: 'combine' as const,
  }));
  const { data, error } = await service.from('keywords').insert(rows).select('id');
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
 *
 * Geographic localization (migration 0026): pulls brand.service_areas and
 * injects into the prompt so a Kunming-based tenant doesn't get
 * "北京/上海/广州" candidates. Without this, doubao's training-data prior
 * defaults to top-tier cities for medical queries — useless for local brands.
 */
export async function digKeywords(
  tenantSlug: string,
  input: DigInput,
): Promise<DigResult> {
  const tenantPre = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const seed = normalizeTerm(input.seed);
  if (!seed) throw new Error('请填写核心词');

  // Resolve brand drainage scope so dig prompt is geographically grounded.
  const service = getSupabaseServiceClient();
  const { data: brandRow } = await service
    .from('brands')
    .select('service_areas')
    .eq('tenant_id', tenantPre.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const serviceAreas: string[] = Array.isArray(brandRow?.service_areas)
    ? (brandRow!.service_areas as string[]).map((s) => s.trim()).filter(Boolean)
    : [];

  let raw: string[] = [];
  let used_stub = false;

  if (llmAvailable()) {
    const geoConstraint =
      serviceAreas.length > 0
        ? `\n本品牌服务地区限定: ${serviceAreas.join('、')}。所有"地域+服务"型长尾词必须只用这些地区(及其下辖城市/区县),**严禁**列举北京/上海/广州/深圳等其他无关城市的本地词。可保留全国通用型词(医保政策、术后注意、对比类、人群类)不带地名。`
        : '\n本品牌未配置服务地区,产出**全国通用**长尾词为主,不要堆砌任何具体城市本地词。';
    let content: string;
    try {
      const result = await chat({
        messages: [
          {
            role: 'system',
            content:
              '你是 SEO/GEO 关键词专家。给定一个核心词,产出 50 个相关的长尾搜索词,覆盖价格、流程、对比、风险、本地化、人群等不同意图维度。' +
              geoConstraint +
              '\n严格返回 JSON: {"candidates": ["...", ...]}。每条不超过 30 字。禁止使用医疗绝对化用语(治愈/根治/最好/第一)。',
          },
          { role: 'user', content: `核心词: ${seed}` },
        ],
        response_format: 'json_object',
        temperature: 0.7,
        timeout_ms: 90_000,
      });
      content = result.content;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/abort|timeout|timed out/i.test(msg)) {
        throw new Error('AI 挖掘超时(>90 秒)。请重试,或换一个更具体的核心词。');
      }
      throw new Error(`AI 调用失败: ${msg}`);
    }
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

  // Compliance gate 1 — tenantPre already resolved at top of function
  const { accepted, rejected } = await filterByCompliance(tenantPre.id, raw);
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

  const deduped = Array.from(new Set(accepted));
  const { fresh } = await partitionExisting(tenant.id, deduped);
  if (fresh.length === 0) {
    return { inserted: 0, skipped: cleaned.length };
  }
  const rows = fresh.map((text) => ({
    tenant_id: tenant.id,
    group_id: groupId,
    text,
    source: 'ai_dig' as const,
  }));
  const { data, error } = await service.from('keywords').insert(rows).select('id');
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

/**
 * KW-4 — edit a keyword's text in place. Preserves group_id, source, intent,
 * created_at + downstream content_items.keyword_ids references (FK is by id,
 * not by text). Cross-tenant + own-tenant duplicate guarded.
 */
export async function editKeyword(
  tenantSlug: string,
  keywordId: string,
  newText: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const trimmed = normalizeTerm(newText);
  if (!trimmed) throw new Error('请填写关键词');
  if (trimmed.length > MAX_TEXT_LEN) throw new Error(`关键词过长(超过 ${MAX_TEXT_LEN} 字)`);

  const { data: current } = await service
    .from('keywords')
    .select('id, text')
    .eq('id', keywordId)
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!current) throw new Error('关键词不存在');
  if (current.text === trimmed) return; // no-op

  // Same-tenant duplicate guard (excluding self).
  const { data: dup } = await service
    .from('keywords')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('text', trimmed)
    .is('deleted_at', null)
    .neq('id', keywordId);
  if ((dup ?? []).length > 0) {
    throw new Error(`已有同文关键词「${trimmed}」,无法修改`);
  }

  const { error } = await service
    .from('keywords')
    .update({ text: trimmed, updated_at: new Date().toISOString() })
    .eq('id', keywordId)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`修改失败: ${error.message}`);
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
