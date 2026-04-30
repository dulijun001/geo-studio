import Link from 'next/link';
import type { ReactNode } from 'react';
import { readStaffSession } from '@/lib/staff-session';
import { getStaffContext } from '@/lib/staff';
import { logoutStaff } from './actions';
import { PwaRegister } from './pwa-register';

export const metadata = {
  title: 'GEO Studio · 员工端',
  manifest: '/manifest.webmanifest',
  themeColor: '#6366f1',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'GEO 员工' },
  icons: { icon: '/icon-192.svg', apple: '/icon-512.svg' },
};

/**
 * Staff (mobile web) shell.
 *
 * Login is gated by the `geo_staff_session` cookie (see lib/staff-session.ts).
 * The /staff/login sub-tree is excluded from the gate by checking pathname below —
 * cleaner than a middleware-level split, since the layout already runs on every
 * /staff/* render.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const session = readStaffSession();
  const ctx = session ? await getStaffContext() : null;

  return (
    <div className="min-h-screen bg-muted/20">
      <PwaRegister />
      <header className="border-b border-border bg-background px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link href="/staff" className="text-sm font-semibold">
            GEO Studio · 员工端
          </Link>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Link href="/staff/help" className="hover:text-foreground">
              使用手册
            </Link>
            {ctx ? (
              <form action={logoutStaff}>
                <button type="submit" className="hover:text-foreground">
                  {ctx.staff_name} · 退出
                </button>
              </form>
            ) : (
              <span>未登录</span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  );
}
