import Link from 'next/link';
import { requireTenantMember } from '@/lib/tenant';
import { BattleReportView } from './battle-report-view';

export const metadata = {
  title: '战情研报与竞品透视 · GEO Studio',
  description: '全城口腔品牌提及率对抗、三大引擎采信源穿透与业务隐患雷达',
};

export default async function BattlePage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await requireTenantMember(params.slug);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400 border border-red-500/20">
              ⚔️ 竞品战情中枢
            </span>
            <span className="text-xs text-muted-foreground">
              监测周期：2026-W41（10.05 - 10.12）· 199 轮快照 · 1,100+ 引源穿透
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            全城口腔行业 GEO 战情与引源深度审计
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            松鼠口腔（本院）vs 昆明全城 8 家竞品在字节豆包、DeepSeek、腾讯元宝三大主流大模型真实收录与对抗透视
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/t/${tenant.slug}/playbook`}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            📋 查看 12 周执行计划
          </Link>
          <Link
            href={`/t/${tenant.slug}/sov`}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            📊 8 周历史 SOV
          </Link>
        </div>
      </div>

      <BattleReportView tenantSlug={tenant.slug} />
    </div>
  );
}
