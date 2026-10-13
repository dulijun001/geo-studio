import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { SidebarNav, type NavItem } from '@/components/sidebar-nav';
import { TenantProvider } from '@/lib/tenant-context';
import { requireTenantMember } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SpotlightCursor } from '@/components/motion/spotlight-cursor';
import {
  CommandPalette,
  CommandPaletteHint,
  type CommandItem,
} from '@/components/command-palette';

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const tenant = await requireTenantMember(params.slug);
  const badges = await loadBadges(tenant.id, tenant.role);
  const menu = buildMenu(tenant.role, badges);

  const roleLabel: Record<string, string> = {
    owner: '所有者',
    admin: '管理员',
    operator: '运营',
    auditor: '法务',
    staff: '员工',
  };

  const sidebarInner = (
    <>
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand text-white shadow-md">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-foreground">GEO Studio</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Generative Engine Optimization
              </p>
            </div>
          </div>

          <div className="mx-3 mb-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="truncate text-sm font-medium" title={tenant.name}>
              {tenant.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {tenant.industry} · {roleLabel[tenant.role] ?? tenant.role}
            </p>
          </div>

          <div className="flex-1 px-3">
            <SidebarNav tenantSlug={tenant.slug} items={menu} />
          </div>

          <div className="space-y-0.5 border-t border-border p-3">
            <Link
              href={`/t/${tenant.slug}/help`}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
              使用手册
            </Link>
            <Link
              href="/app"
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
                <path d="M9 22H4a2 2 0 01-2-2V4a2 2 0 012-2h5" />
              </svg>
              切换租户
            </Link>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                退出登录
              </button>
            </form>
          </div>
    </>
  );

  return (
    <TenantProvider tenant={tenant}>
      <AdminShell sidebar={sidebarInner}>{children}</AdminShell>
      <SpotlightCursor />
      <CommandPalette
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        items={buildCommandItems(menu, badges)}
      />
      <CommandPaletteHint />
    </TenantProvider>
  );
}

type Badges = {
  /** Pending manual + rejected variants — anything that needs an admin's eyes. */
  compliance: number;
};

async function loadBadges(tenantId: string, role: string): Promise<Badges> {
  // Only roles that see compliance need the count
  if (!['owner', 'admin', 'auditor'].includes(role)) {
    return { compliance: 0 };
  }
  const supabase = createSupabaseServerClient();
  const { count } = await supabase
    .from('content_variants')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('compliance_status', ['pending', 'rejected'])
    .is('deleted_at', null);
  return { compliance: count ?? 0 };
}

/**
 * Build CommandPalette items from the same role-filtered menu.
 * Adds rich hints + keyword matchers so search works in Chinese.
 */
function buildCommandItems(menu: NavItem[], badges: Badges): CommandItem[] {
  const HINTS: Record<string, { hint: string; keywords: string }> = {
    '': { hint: '工作台首页 · 总览 KPI', keywords: 'overview home dashboard 仪表盘' },
    '/playbook': { hint: 'GEO 12 周执行计划', keywords: 'playbook plan 计划 执行 路线图' },
    '/content': { hint: '内容素材库', keywords: 'content material 内容 素材' },
    '/content/rescue': { hint: '老内容救援', keywords: 'rescue old 老内容 救援' },
    '/publish': { hint: '员工矩阵派单', keywords: 'publish dispatch 派发 矩阵 员工' },
    '/tracking': { hint: '豆包真人模拟抓取', keywords: 'tracking geo 追踪 豆包' },
    '/loops': { hint: '发布→引用→行动 四回路一页', keywords: 'loops feedback 回路 看板 引用率 污染 时效' },
    '/sov': { hint: '8 周 SOV 热力图', keywords: 'sov heatmap 战况 热力图 share of voice' },
    '/compliance': {
      hint: badges.compliance > 0 ? `${badges.compliance} 待审` : '医疗合规四道门',
      keywords: 'compliance review 合规 审核 医疗',
    },
    '/attribution': { hint: '多钩子转化归因', keywords: 'attribution conversion 归因 转化 暗号' },
    '/discoverability': { hint: 'Schema/JSON-LD/llms.txt', keywords: 'discoverability schema layer-a 可发现层' },
    '/questions': { hint: '问题库 active queries', keywords: 'questions queries 问题 query' },
    '/templates': { hint: '12 套写作要求', keywords: 'templates writing 写作 模板' },
    '/keywords': { hint: '关键词 + AI 智能挖掘', keywords: 'keywords 关键词 词库 ai dig' },
    '/citations': { hint: '引用源白名单 + key_claims', keywords: 'citations references 引用 白名单' },
    '/settings': { hint: '租户配置 + 成员', keywords: 'settings config 设置 配置' },
  };
  return menu.map((m) => {
    const meta = HINTS[m.href];
    return {
      href: m.href,
      label: m.label,
      hint: meta?.hint,
      keywords: meta?.keywords ?? '',
    };
  });
}

function buildMenu(role: string, badges: Badges): NavItem[] {
  const all: Array<NavItem & { allowed?: readonly string[] }> = [
    { href: '', label: '概览', iconKey: 'overview' },
    { href: '/daily-ops', label: '每日自动化', iconKey: 'overview', newBadge: 'NEW' },
    { href: '/questions', label: '问题库', iconKey: 'content', allowed: ['owner', 'admin', 'operator'] },
    { href: '/content', label: '内容素材', iconKey: 'content' },
    { href: '/publish', label: '员工派单', iconKey: 'publish' },
    {
      href: '/compliance',
      label: '合规审核',
      iconKey: 'compliance',
      allowed: ['owner', 'admin', 'auditor'],
      badge: badges.compliance,
    },
    { href: '/tracking', label: 'GEO 追踪', iconKey: 'tracking' },
    { href: '/sov', label: 'SOV 战况图', iconKey: 'tracking' },
    { href: '/loops', label: '回路看板', iconKey: 'tracking', allowed: ['owner', 'admin', 'operator'] },
    { href: '/discoverability', label: '可发现层', iconKey: 'compliance', allowed: ['owner', 'admin', 'operator'] },
    { href: '/citations', label: '引用源', iconKey: 'compliance', allowed: ['owner', 'admin', 'operator'] },
    { href: '/settings', label: '设置', iconKey: 'settings', allowed: ['owner', 'admin'] },
  ];
  return all.filter((item) => !item.allowed || item.allowed.includes(role));
}
