import { redirect } from 'next/navigation';
import { readStaffSession } from '@/lib/staff-session';
import { loginWithPassword } from './actions';

export const dynamic = 'force-dynamic';

export default function StaffLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; phone?: string };
}) {
  if (readStaffSession()) redirect('/staff');

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">员工登录</h1>
          <p className="text-sm text-muted-foreground">
            输入手机号和密码。第一次使用?管理员会通过微信发你一个邀请链接 — 点链接设置一次密码,之后随时登录。
          </p>
        </header>

        <form action={loginWithPassword} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">手机号</span>
            <input
              name="phone"
              type="tel"
              required
              inputMode="numeric"
              pattern="1[3-9]\d{9}"
              defaultValue={searchParams.phone ?? ''}
              placeholder="13812345678"
              autoComplete="username"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">密码</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              placeholder="自己设置的密码"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </label>

          {searchParams.error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {decodeErrorMessage(searchParams.error)}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            登录
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          忘记密码?让管理员重新发邀请链接给你。
        </p>
      </div>
    </div>
  );
}

function decodeErrorMessage(code: string): string {
  const map: Record<string, string> = {
    // STF-2: collapsed code — covers wrong-password / not-found / no-password /
    // ambiguous / expired-invite / consumed-invite. We deliberately don't tell
    // the user which case they hit so attackers can't enumerate registered phones.
    invalid: '手机号或密码不正确。如未设置密码,请联系管理员获取邀请链接。',
    rate_limited: '尝试次数过多,请稍后再试(默认锁 30 分钟)。',
    missing_secret: '系统未配置 STAFF_SESSION_SECRET,请联系管理员。',
    unknown: '登录失败,请稍后再试。',
  };
  return map[code] ?? map.unknown ?? '登录失败';
}
