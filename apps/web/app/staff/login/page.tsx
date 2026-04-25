import { redirect } from 'next/navigation';
import { readStaffSession } from '@/lib/staff-session';
import { loginWithPasscode } from './actions';

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
            请输入你的手机号和 6 位访问码。访问码由管理员发给你,15 分钟内有效。
          </p>
        </header>

        <form action={loginWithPasscode} className="space-y-4">
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
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">访问码</span>
            <input
              name="passcode"
              type="text"
              required
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="6 位数字"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-foreground/10"
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
          访问码丢了?请联系你的管理员重新生成。
        </p>
      </div>
    </div>
  );
}

function decodeErrorMessage(code: string): string {
  const map: Record<string, string> = {
    invalid: '手机号或访问码不正确。',
    expired: '访问码已过期,请向管理员申请新的。',
    consumed: '该访问码已使用过,请向管理员申请新的。',
    not_found: '手机号未登记,请确认后重试。',
    ambiguous: '此手机号关联了多个品牌,请让管理员生成一次性登录链接。',
    missing_secret: '系统未配置 STAFF_SESSION_SECRET,请联系管理员。',
    unknown: '登录失败,请稍后再试。',
  };
  return map[code] ?? map.unknown ?? '登录失败';
}
