import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import { TemplatesTable, type TemplateRow } from './templates-table';

export const dynamic = 'force-dynamic';

export default async function WritingTemplatesPage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();
  const service = getSupabaseServiceClient();

  // System presets read via service client — RLS allows authenticated reads of
  // tenant_id IS NULL rows, but we want the result regardless of session shape.
  const [systemRes, customRes, tenantRes] = await Promise.all([
    service
      .from('writing_templates')
      .select('id, slug, name, description, prompt_skeleton, structure_hint, is_system, visible, updated_at')
      .is('tenant_id', null)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('writing_templates')
      .select('id, slug, name, description, prompt_skeleton, structure_hint, is_system, visible, updated_at')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    service.from('tenants').select('settings').eq('id', tenant.id).single(),
  ]);

  const settings = (tenantRes.data?.settings ?? {}) as Record<string, unknown>;
  const tpl = (settings.templates ?? {}) as Record<string, unknown>;
  const hiddenSlugs = new Set((tpl.hidden_template_slugs as string[] | undefined) ?? []);

  const systemRows: TemplateRow[] = (systemRes.data ?? []).map((r) => ({
    ...(r as TemplateRow),
    visible: !hiddenSlugs.has(r.slug as string),
  }));
  const customRows = (customRes.data ?? []) as TemplateRow[];
  const allRows = [...systemRows, ...customRows];

  return (
    <div className="space-y-6">
      <PageHeader
        title="写作要求"
        subtitle={`${systemRows.length} 系统预设 + ${customRows.length} 自定义 — 创作向导第 3 步会用到`}
      />

      <InlineGuide
        storageKey={`guide:templates:${tenant.slug}`}
        title="什么是写作要求"
        body={
          '写作要求 = 内容的"意图骨架":角色(谁在写)、结构(分几段)、声调倾向(严肃/口语/客观)。' +
          '它和"平台风格"叠加 —— 同一个"产品对比"模板,选小红书出口语化版本,选公众号出故事化版本。' +
          '12 个系统预设由 GEO/合规团队配置,只能整体隐藏;租户可以新建自己的模板复用。'
        }
        steps={[
          '先在列表里浏览 12 个预设,试用看哪个最贴你的内容方向',
          '不需要的预设可以"隐藏"(只对你这个租户隐藏,其他租户不受影响)',
          '需要特殊场景就"+ 新建"自定义模板',
        ]}
        linkLabel="架构决策 ADR-007"
        linkHref={`/t/${tenant.slug}/help#templates`}
      />

      <TemplatesTable tenantSlug={tenant.slug} rows={allRows} />
    </div>
  );
}
