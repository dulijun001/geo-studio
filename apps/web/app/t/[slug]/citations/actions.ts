'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type CitationSourceType =
  | 'guideline'
  | 'research_paper'
  | 'textbook'
  | 'official_document'
  | 'industry_standard'
  | 'other';

export type CitationInput = {
  title: string;
  title_aliases: string[];
  source_type: CitationSourceType;
  issuer: string;
  publication_year: number | null;
  url: string;
  notes: string;
  key_claims: string[];
};

const MAX_TITLE = 200;
const MAX_NOTES = 500;
const MAX_ALIAS_LEN = 80;
const MAX_ALIASES = 10;
const MAX_KEY_CLAIM_LEN = 240;
const MAX_KEY_CLAIMS = 30;

const VALID_SOURCE_TYPES: ReadonlySet<CitationSourceType> = new Set([
  'guideline',
  'research_paper',
  'textbook',
  'official_document',
  'industry_standard',
  'other',
]);

function normalize(input: CitationInput) {
  const title = input.title.trim();
  if (!title) throw new Error('标题不能为空');
  if (title.length > MAX_TITLE) throw new Error(`标题过长(>${MAX_TITLE} 字)`);

  if (!VALID_SOURCE_TYPES.has(input.source_type)) {
    throw new Error('来源类型不合法');
  }

  // P1-3 — dedup + trim aliases. Drop the alias if it equals the title
  // (that's redundant and pollutes fuzzy matching).
  const aliases = Array.from(
    new Set(
      input.title_aliases
        .map((a) => a.trim())
        .filter((a) => a.length > 0 && a.length <= MAX_ALIAS_LEN && a !== title),
    ),
  ).slice(0, MAX_ALIASES);

  // P1-1 — URL sanity. Reject if non-empty and not http(s) — prevents
  // "见上文" / typo / data: URI being saved silently.
  const url = input.url.trim();
  if (url && !/^https?:\/\/.+/.test(url)) {
    throw new Error('URL 必须以 http:// 或 https:// 开头(或留空)');
  }

  const notes = input.notes.trim();
  if (notes.length > MAX_NOTES) throw new Error(`备注过长(>${MAX_NOTES} 字)`);

  // key_claims — P0-2 fuel for C1 numeric-fact-check LLM judge.
  const cleanedClaims = Array.from(
    new Set(
      input.key_claims
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && c.length <= MAX_KEY_CLAIM_LEN),
    ),
  ).slice(0, MAX_KEY_CLAIMS);

  // publication_year sanity (1900..currentYear+1)
  const yearNow = new Date().getFullYear();
  let year: number | null = null;
  if (input.publication_year !== null && input.publication_year !== undefined) {
    const y = Number(input.publication_year);
    if (!Number.isInteger(y) || y < 1900 || y > yearNow + 1) {
      throw new Error(`年份范围 1900-${yearNow + 1}`);
    }
    year = y;
  }

  return {
    title,
    title_aliases: aliases,
    source_type: input.source_type,
    issuer: input.issuer.trim() || null,
    publication_year: year,
    url: url || null,
    notes: notes || null,
    key_claims: cleanedClaims,
  };
}

export async function createCitation(
  tenantSlug: string,
  input: CitationInput,
): Promise<{ id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const payload = normalize(input);

  // Same-title pre-check so the user gets a clean message instead of a
  // unique-violation error from Postgres (we don't have a unique constraint
  // here, but operators creating duplicates is operational pain).
  const { data: dup } = await service
    .from('verified_citations')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('title', payload.title)
    .is('deleted_at', null);
  if ((dup ?? []).length > 0) {
    throw new Error(`已有同名引用源「${payload.title}」`);
  }

  const { data, error } = await service
    .from('verified_citations')
    .insert({
      tenant_id: tenant.id,
      ...payload,
      active: true,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`创建失败: ${error?.message}`);
  revalidatePath(`/t/${tenantSlug}/citations`);
  return { id: data.id as string };
}

export async function updateCitation(
  tenantSlug: string,
  id: string,
  input: CitationInput,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const payload = normalize(input);

  // Ensure the row belongs to this tenant — service-role bypasses RLS, so
  // we tighten manually.
  const { data: row } = await service
    .from('verified_citations')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.tenant_id !== tenant.id) throw new Error('引用源不存在或无权编辑');

  const { error } = await service
    .from('verified_citations')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`更新失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/citations`);
}

export async function toggleActive(
  tenantSlug: string,
  id: string,
  nextActive: boolean,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('verified_citations')
    .update({ active: nextActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`切换失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/citations`);
}

export async function deleteCitation(
  tenantSlug: string,
  id: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('verified_citations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/citations`);
}
