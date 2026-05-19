/**
 * V1.10 / docs/09 — daily-ops Hub page (T6 + T4 + T9 collapsed into tabs).
 *
 * One URL `/t/[slug]/daily-ops` is the entry. `?tab=manual` or `?tab=settings`
 * switches view; default = today. Tabs are server-rendered Links (no client
 * state) so URL is shareable + emails can deep-link to any tab.
 */
import { unstable_noStore as noStore } from 'next/cache';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/tenant';
import { ManualSlotsView } from './manual-slots-view';
import { SettingsView } from './settings-view';
import { TabNav, type DailyOpsTab } from './tab-nav';
import { TodayView } from './today-view';

export const dynamic = 'force-dynamic';

function resolveTab(raw: string | undefined): DailyOpsTab {
  if (raw === 'manual' || raw === 'settings') return raw;
  return 'today';
}

export default async function DailyOpsHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  noStore();
  const { slug } = await params;
  const { tab } = await searchParams;
  const active = resolveTab(tab);

  // owner / admin / operator / auditor 都能看
  const tenant = await requireRole(slug, ['owner', 'admin', 'operator', 'auditor']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="每日自动化"
        subtitle="daily-ops · 凌晨自动选题 + AI 起草 + 合规分类,只让你管异常"
      />

      <TabNav slug={slug} active={active} />

      {active === 'today' && <TodayView slug={slug} tenantId={tenant.id} />}
      {active === 'manual' && <ManualSlotsView slug={slug} tenantId={tenant.id} />}
      {active === 'settings' && <SettingsView slug={slug} tenantId={tenant.id} />}
    </div>
  );
}
