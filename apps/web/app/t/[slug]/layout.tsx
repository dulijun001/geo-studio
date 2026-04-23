import Link from 'next/link';
import type { ReactNode } from 'react';
import { TenantProvider } from '@/lib/tenant-context';
import { requireTenantMember } from '@/lib/tenant';

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const tenant = await requireTenantMember(params.slug);

  const menu = buildMenu(tenant.role);

  return (
    <TenantProvider tenant={tenant}>
      <div className="flex min-h-screen">
        <aside className="w-56 shrink-0 border-r border-border bg-muted/30 p-4">
          <div className="mb-6 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              GEO Studio
            </p>
            <p className="truncate text-sm font-semibold" title={tenant.name}>
              {tenant.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {tenant.industry} · {tenant.role}
            </p>
          </div>
          <nav className="space-y-1">
            {menu.map((item) => (
              <Link
                key={item.href}
                href={`/t/${tenant.slug}${item.href}`}
                className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 space-y-1 border-t border-border pt-4">
            <Link
              href="/app"
              className="block rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            >
              切换租户
            </Link>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="w-full rounded-md px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
              >
                退出登录
              </button>
            </form>
          </div>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </TenantProvider>
  );
}

type MenuItem = { href: string; label: string; allowed?: readonly string[] };

function buildMenu(role: string): MenuItem[] {
  const all: MenuItem[] = [
    { href: '', label: '概览' },
    { href: '/content', label: '内容' },
    { href: '/publish', label: '派单' },
    { href: '/tracking', label: 'GEO 追踪' },
    { href: '/compliance', label: '合规审核', allowed: ['owner', 'admin', 'auditor'] },
    { href: '/attribution', label: '转化归因', allowed: ['owner', 'admin', 'operator'] },
    { href: '/settings', label: '设置', allowed: ['owner', 'admin'] },
  ];
  return all.filter((item) => !item.allowed || item.allowed.includes(role));
}
