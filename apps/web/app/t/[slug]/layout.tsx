import Link from 'next/link';
import type { ReactNode } from 'react';
import { SidebarNav, type NavItem } from '@/components/sidebar-nav';
import { TenantProvider } from '@/lib/tenant-context';
import { requireTenantMember } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

  return (
    <TenantProvider tenant={tenant}>
      <div className="flex min-h-screen bg-muted/40">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-muted/60 backdrop-blur">
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
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/70 hover:text-foreground"
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
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/70 hover:text-foreground"
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
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/70 hover:text-foreground"
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
        </aside>
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
        </main>
      </div>
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

function buildMenu(role: string, badges: Badges): NavItem[] {
  const all: Array<NavItem & { allowed?: readonly string[] }> = [
    { href: '', label: '概览', iconKey: 'overview' },
    { href: '/playbook', label: 'GEO 执行计划', iconKey: 'playbook' },
    { href: '/content', label: '内容', iconKey: 'content' },
    { href: '/publish', label: '派单', iconKey: 'publish' },
    { href: '/tracking', label: 'GEO 追踪', iconKey: 'tracking' },
    {
      href: '/compliance',
      label: '合规审核',
      iconKey: 'compliance',
      allowed: ['owner', 'admin', 'auditor'],
      badge: badges.compliance,
    },
    { href: '/attribution', label: '转化归因', iconKey: 'attribution', allowed: ['owner', 'admin', 'operator'] },
    { href: '/settings', label: '设置', iconKey: 'settings', allowed: ['owner', 'admin'] },
  ];
  return all.filter((item) => !item.allowed || item.allowed.includes(role));
}
