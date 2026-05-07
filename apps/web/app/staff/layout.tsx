import Link from 'next/link';
import type { ReactNode } from 'react';
import { readStaffSession } from '@/lib/staff-session';
import { getStaffContext } from '@/lib/staff';
import { logoutStaff } from './actions';
import { PwaRegister } from './pwa-register';

export const metadata = {
  title: 'GEO Studio · 员工端',
  manifest: '/manifest.webmanifest',
  themeColor: '#08090a',
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
    <div className="min-h-screen bg-background">
      <PwaRegister />
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ background: 'rgba(8,9,10,0.78)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link href="/staff" className="flex items-center gap-2 text-sm font-semibold">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: '#34d399', boxShadow: '0 0 0 3px rgba(52,211,153,0.2)' }}
            />
            员工端
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
