'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type WritingTemplateInput = {
  slug: string;
  name: string;
  description: string;
  prompt_skeleton: string;
  /** UI passes sections as a textarea string (one section per line). */
  sections_text: string;
  min_sections: number | null;
};

const SLUG_RE = /^[a-z][a-z0-9-]{1,40}$/;

function normalize(raw: WritingTemplateInput) {
  const slug = raw.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error('slug 格式错误:小写字母开头,只能含 a-z 0-9 -,2-41 字符');
  }
  const name = raw.name.trim();
  if (!name) throw new Error('请填写名称');
  if (name.length > 40) throw new Error('名称过长(超过 40 字)');
  const prompt = raw.prompt_skeleton.trim();
  if (!prompt) throw new Error('prompt_skeleton 不能为空');
  if (prompt.length > 4000) throw new Error('prompt_skeleton 过长(超过 4000 字)');
  const sections = raw.sections_text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    slug,
    name,
    description: raw.description.trim() || null,
    prompt_skeleton: prompt,
    structure_hint: {
      sections,
      ...(raw.min_sections && raw.min_sections > 0
        ? { min_sections: raw.min_sections }
        : {}),
    },
  };
}

export async function createTemplate(
  tenantSlug: string,
  input: WritingTemplateInput,
): Promise<{ id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const payload = normalize(input);

  // P0-1 / P1-2 / P1-3 — slug collision defense.
  //
  // The migration's two unique indexes are scope-partial (system in
  // tenant_id IS NULL, custom in tenant_id IS NOT NULL); they don't prevent
  // a tenant from picking a slug that's already a system preset. Wizard
  // would then display two same-slug cards. Plus the partial index doesn't
  // catch race-condition double-INSERT (Postgres ON CONFLICT can't target
  // partial predicates without index_predicate, which the JS client doesn't
  // support — same gotcha we hit on `keywords`).
  //
  // Two-phase check: (a) is the slug used by ANY non-deleted row visible to
  // this tenant? (system preset OR same tenant's own row) (b) only after
  // that, INSERT.
  const { data: collisions, error: cErr } = await service
    .from('writing_templates')
    .select('id, tenant_id, is_system')
    .eq('slug', payload.slug)
    .or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`)
    .is('deleted_at', null);
  if (cErr) throw new Error(`slug 校验失败: ${cErr.message}`);
  if (collisions && collisions.length > 0) {
    const sys = collisions.find((c) => c.is_system);
    if (sys) {
      throw new Error(`slug "${payload.slug}" 已被系统预设占用,请换一个(可加后缀如 "-custom")`);
    }
    throw new Error(`slug "${payload.slug}" 已被你的其他模板占用,请换一个`);
  }

  const { data, error } = await service
    .from('writing_templates')
    .insert({
      tenant_id: tenant.id,
      ...payload,
      is_system: false,
      visible: true,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`创建失败: ${error?.message}`);
  revalidatePath(`/t/${tenantSlug}/templates`);
  return { id: data.id as string };
}

export async function updateTemplate(
  tenantSlug: string,
  id: string,
  input: WritingTemplateInput,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const payload = normalize(input);

  // Defense in depth: even though RLS forbids editing is_system rows, double-check here.
  const { data: row, error: rerr } = await service
    .from('writing_templates')
    .select('is_system, tenant_id')
    .eq('id', id)
    .single();
  if (rerr || !row) throw new Error('模板不存在');
  if (row.is_system) throw new Error('系统预设模板不可编辑(可在列表上隐藏)');
  if (row.tenant_id !== tenant.id) throw new Error('无权编辑');

  const { error } = await service
    .from('writing_templates')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`更新失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/templates`);
}

/**
 * Toggle visibility — works for BOTH system presets and tenant rows. For
 * system presets we don't actually flip the global `visible` flag (that
 * would affect all tenants), instead we maintain a tenant-side override in
 * tenants.settings.hidden_template_slugs.
 */
export async function toggleVisibility(
  tenantSlug: string,
  templateId: string,
  isSystem: boolean,
  systemSlug: string | null,
  nextVisible: boolean,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  if (!isSystem) {
    const { error } = await service
      .from('writing_templates')
      .update({ visible: nextVisible, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .eq('tenant_id', tenant.id);
    if (error) throw new Error(`切换失败: ${error.message}`);
  } else {
    if (!systemSlug) throw new Error('系统模板缺少 slug');
    // Read tenant settings and toggle slug in `hidden_template_slugs`.
    const { data: t } = await service
      .from('tenants')
      .select('settings')
      .eq('id', tenant.id)
      .single();
    const settings = (t?.settings ?? {}) as Record<string, unknown>;
    const tpl = (settings.templates ?? {}) as Record<string, unknown>;
    const hidden = new Set((tpl.hidden_template_slugs as string[] | undefined) ?? []);
    if (nextVisible) hidden.delete(systemSlug);
    else hidden.add(systemSlug);
    const next = {
      ...settings,
      templates: { ...tpl, hidden_template_slugs: Array.from(hidden) },
    };
    const { error } = await service
      .from('tenants')
      .update({ settings: next })
      .eq('id', tenant.id);
    if (error) throw new Error(`切换失败: ${error.message}`);
  }
  revalidatePath(`/t/${tenantSlug}/templates`);
}

export async function deleteTemplate(
  tenantSlug: string,
  id: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();

  const { data: row, error: rerr } = await service
    .from('writing_templates')
    .select('is_system, tenant_id')
    .eq('id', id)
    .single();
  if (rerr || !row) throw new Error('模板不存在');
  if (row.is_system) throw new Error('系统预设模板不可删除(可隐藏)');
  if (row.tenant_id !== tenant.id) throw new Error('无权删除');

  const { error } = await service
    .from('writing_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除失败: ${error.message}`);
  revalidatePath(`/t/${tenantSlug}/templates`);
}
