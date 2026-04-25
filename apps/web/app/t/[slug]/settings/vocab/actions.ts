'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const VOCAB_TYPES = ['brand', 'doctor', 'service', 'location_alias', 'competitor'] as const;
export type VocabType = (typeof VOCAB_TYPES)[number];

export async function createVocab(
  tenantSlug: string,
  input: { term: string; term_type: VocabType; aliases: string },
): Promise<{ id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const term = input.term.trim();
  if (!term) throw new Error('请填写主名');
  if (term.length > 80) throw new Error('主名过长(超过 80 字)');
  if (!VOCAB_TYPES.includes(input.term_type)) throw new Error('类型不合法');

  const aliases = input.aliases
    .split(/[,,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  const service = getSupabaseServiceClient();

  // Avoid silent duplicates within (tenant, term, term_type).
  const { data: dup } = await service
    .from('brand_vocab')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('term', term)
    .eq('term_type', input.term_type)
    .is('deleted_at', null)
    .limit(1);
  if (dup && dup.length > 0) throw new Error('已经存在同名同类型的词条');

  const { data: row, error } = await service
    .from('brand_vocab')
    .insert({
      tenant_id: tenant.id,
      term,
      term_type: input.term_type,
      aliases,
    })
    .select('id')
    .single();
  if (error || !row) throw new Error(`新建失败: ${error?.message}`);

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    action: 'vocab.created',
    target_type: 'brand_vocab',
    target_id: row.id,
    payload: { term, term_type: input.term_type, alias_count: aliases.length },
  });

  revalidatePath(`/t/${tenantSlug}/settings/vocab`);
  return { id: row.id as string };
}

export async function deleteVocab(tenantSlug: string, vocabId: string): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();

  // Soft delete: GEO snapshots' citations may reference this vocab_id; a hard
  // delete would orphan rows under FK ON DELETE SET NULL. Soft-delete keeps
  // the historical mention attribution intact.
  const { error } = await service
    .from('brand_vocab')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', vocabId)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除失败: ${error.message}`);

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    action: 'vocab.deleted',
    target_type: 'brand_vocab',
    target_id: vocabId,
    payload: {},
  });

  revalidatePath(`/t/${tenantSlug}/settings/vocab`);
}
