import { redirect } from 'next/navigation';
import { readStaffSession } from '@/lib/staff-session';
import { inspectSetupToken, setupStaffPassword } from './actions';

export const dynamic = 'force-dynamic';

export default async function StaffSetupPage({
  searchParams,
}: {
  searchParams: { token?: string; error?: string; detail?: string };
}) {
  if (readStaffSession()) redirect('/staff');

  const token = searchParams.token ?? '';
  const inspection = await inspectSetupToken(token);

  if (!inspection.ok) {
    return (
      <div className="min-h-screen bg-muted/20 px-4 py-10">
        <div className="mx-auto w-full max-w-sm space-y-4">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold">链接无效</h1>
            <p className="text-sm text-muted-foreground">
              {reasonLabel(inspection.reason)}请联系管理员重新发送邀请。
            </p>
          </header>
          <a
            href="/staff/login"
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-center text-sm hover:bg-muted"
          >
            返回登录
          </a>
        </div>
      </div>
    );
  }

  const isReset = inspection.kind === 'reset';

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">
            {isReset ? '重置登录密码' : '设置登录密码'}
          </h1>
          <p className="text-sm text-muted-foreground">
            你好,{inspection.staff_name}。
            {isReset ? '为账号 ' : '欢迎加入。请为账号 '}
            <code className="font-mono">{inspection.phone}</code> 设置一个密码,
            之后用手机号 + 密码登录。
          </p>
        </header>

        <form action={setupStaffPassword} className="space-y-4">
          <input type="hidden" name="token" value={token} />

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">新密码</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder="至少 8 位 · 字母 + 数字"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">再次确认</span>
            <input
              name="confirm"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder="重新输入相同的密码"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </label>

          {searchParams.error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {errorLabel(searchParams.error, searchParams.detail)}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            {isReset ? '保存新密码并登录' : '保存密码并登录'}
          </button>
        </form>

        <p className="text-center text-[11px] text-muted-foreground">
          密码会被加密存储,管理员看不到你的明文密码。
        </p>
      </div>
    </div>
  );
}

function reasonLabel(reason: 'invalid' | 'expired' | 'consumed'): string {
  return {
    invalid: '链接不正确或已被替换。',
    expired: '链接已过期(超过 24 小时未使用)。',
    consumed: '链接已经使用过,不能重复设置密码。',
  }[reason];
}

function errorLabel(code: string, detail?: string): string {
  if (code === 'mismatch') return '两次输入的密码不一致。';
  if (code === 'weak') return detail ?? '密码强度不够。';
  return '保存失败,请稍后再试。';
}
