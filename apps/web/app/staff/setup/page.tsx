import { readStaffSession, clearStaffSession } from '@/lib/staff-session';
import { inspectSetupToken } from './actions';
import { SetupForm } from './setup-form';

export const dynamic = 'force-dynamic';

export default async function StaffSetupPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  // Invite/reset links are authoritative — they identify the target account
  // by a one-time token, which is more specific than whatever session cookie
  // the browser happens to carry. Clear any leftover staff session so the
  // operator (or staff member testing on a shared device) sees the password
  // form rather than getting silently sent to the previous user's dashboard.
  if (readStaffSession()) clearStaffSession();

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

        <SetupForm token={token} isReset={isReset} />

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
