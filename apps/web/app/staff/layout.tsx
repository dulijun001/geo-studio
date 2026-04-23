import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Staff (mobile web) shell. Separate from the admin /app and /t/[slug] trees.
 *
 * Auth wiring postponed to V1 Week 5 — staff login will use Aliyun SMS OTP
 * (employees don't have work emails). For now this is a visual shell so the
 * routing exists and W5 can fill it in.
 */
export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link href="/staff" className="text-sm font-semibold">
            GEO Studio · 员工端
          </Link>
          <span className="text-xs text-muted-foreground">未登录</span>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  );
}
