import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import { WizardClient, type WizardTemplate, type WizardKeyword, type WizardKbDoc, type WizardGroup } from './wizard-client';

export const dynamic = 'force-dynamic';

export default async function WizardPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();
  const service = getSupabaseServiceClient();

  const [systemTplRes, customTplRes, kwRes, kgRes, kbRes, tenantRes] = await Promise.all([
    service
      .from('writing_templates')
      .select('id, slug, name, description, structure_hint, is_system')
      .is('tenant_id', null)
      .eq('visible', true)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('writing_templates')
      .select('id, slug, name, description, structure_hint, is_system')
      .eq('tenant_id', tenant.id)
      .eq('visible', true)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    supabase
      .from('keywords')
      .select('id, group_id, text, source')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('text', { ascending: true })
      .limit(2000),
    // WIZ-2 — keyword groups so the picker can render by group instead of one
    // flat wall of pills.
    supabase
      .from('keyword_groups')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('knowledge_sources')
      .select('source_path, title, excerpt, category')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(200),
    service.from('tenants').select('settings').eq('id', tenant.id).single(),
  ]);

  // Hidden system slugs per tenant
  const settings = (tenantRes.data?.settings ?? {}) as Record<string, unknown>;
  const tplSettings = (settings.templates ?? {}) as Record<string, unknown>;
  const hiddenSlugs = new Set((tplSettings.hidden_template_slugs as string[] | undefined) ?? []);

  const systemTemplates = ((systemTplRes.data ?? []) as WizardTemplate[])
    .filter((t) => !hiddenSlugs.has(t.slug));
  const customTemplates = (customTplRes.data ?? []) as WizardTemplate[];
  const templates = [...systemTemplates, ...customTemplates];
  const keywords = (kwRes.data ?? []) as WizardKeyword[];
  const groups = (kgRes.data ?? []) as WizardGroup[];
  const kbDocs = (kbRes.data ?? []) as WizardKbDoc[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="创作向导"
        subtitle="3 步:参考资料 → 关键词 → 写作要求 — 全部填好,AI 起草直接出稿"
        actions={
          <Link
            href={`/t/${tenant.slug}/content`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ← 返回内容
          </Link>
        }
      />

      <InlineGuide
        storageKey={`guide:wizard:${tenant.slug}`}
        title="向导和直接 AI 起草什么区别"
        body={
          '直接 AI 起草需要你自己想好"主题 + 受众 + 平台",起草质量取决于你 prompt 输入是否完整。' +
          '向导通过"参考资料 → 植入关键词 → 选写作要求"三步,把缺失的指令补齐,产出更稳定。'
        }
        steps={[
          '第 1 步:挑 1-3 篇知识库素材或上传新材料、并填写主题与受众',
          '第 2 步:从词库勾选要植入的关键词(每个会自然嵌入正文)',
          '第 3 步:选 1 个写作要求 + 1 个目标平台,完成后 AI 起草约 30-50 秒',
        ]}
      />

      {kbDocs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          知识库为空 — 向导的"参考资料"步骤需要素材。
          <Link href={`/t/${tenant.slug}/content`} className="ml-2 text-foreground underline">
            去内容页上传 →
          </Link>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          没有可用的写作要求 — 至少需要一个,系统预设可在
          <Link href={`/t/${tenant.slug}/templates`} className="mx-1 text-foreground underline">
            写作要求
          </Link>
          页解除隐藏。
        </div>
      ) : (
        <WizardClient
          tenantSlug={tenant.slug}
          templates={templates}
          keywords={keywords}
          groups={groups}
          kbDocs={kbDocs}
        />
      )}
    </div>
  );
}
