/**
 * V1.9 — Citation discovery page.
 *
 * LLM recommends authoritative sources for the tenant's industry; operator
 * reviews each candidate (edit title / claims if needed) and bulk-inserts.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/tenant';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { DiscoverClient } from './discover-client';

export const dynamic = 'force-dynamic';

export default async function CitationsDiscoverPage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  if (!tenant) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="自动发现引用源"
        subtitle={`基于行业「${tenant.industry}」让豆包推荐权威源 + 抠 key_claims,你审核后批量入库`}
        actions={
          <Link
            href={`/t/${tenant.slug}/citations`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回引用源白名单
          </Link>
        }
      />

      <InlineGuide
        storageKey="guide:citations-discover"
        title="它怎么工作"
        body="豆包根据你行业(已自动识别)从训练知识里挑出 5-10 个真实权威源,每条提取 3-5 条原文数据点。你审核 → 编辑 → 一键入库。"
        steps={[
          '可选填一个主题(如「种植牙存活率」)让推荐更聚焦',
          'LLM 推荐 → 你逐条审(可编辑标题、年份、key_claims)',
          '勾选要入库的 → 已重名的会自动跳过',
          'key_claims 是 C1 数字幻觉裁判的 ground truth — 必须从原文真实抠出,不要编',
          '入库后会立即生效,下一次 AI 起草就能引用',
        ]}
      />

      <DiscoverClient tenantSlug={tenant.slug} />
    </div>
  );
}
