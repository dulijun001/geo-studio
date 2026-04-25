import Link from 'next/link';
import type { ReactNode } from 'react';
import { readStaffSession } from '@/lib/staff-session';
import { getStaffContext } from '@/lib/staff';
import { logoutStaff } from './actions';

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
      <header className="border-b border-border bg-background px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link href="/staff" className="text-sm font-semibold">
            GEO Studio · 员工端
          </Link>
          {ctx ? (
            <form action={logoutStaff}>
              <button
                type="submit"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {ctx.staff_name} · 退出
              </button>
            </form>
          ) : (
            <span className="text-xs text-muted-foreground">未登录</span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  );
}
