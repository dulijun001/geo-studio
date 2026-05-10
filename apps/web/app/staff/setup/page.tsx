import { inspectSetupToken } from './actions';
import { SetupForm } from './setup-form';

export const dynamic = 'force-dynamic';

export default async function StaffSetupPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  // No session check here — invite/reset tokens are authoritative. If a stale
  // staff session cookie is set (e.g. operator testing the link from a logged-in
  // browser), we still want to render the password form. The setUpPassword
  // server action below issues a fresh session that overwrites the old one,
  // so the user ends up logged in as the invited account either way.
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
            {isReset ? '请填写你的注册手机号 + 设置新密码。' : '欢迎加入。请填写你的注册手机号 + 设置一个密码,之后用手机号 + 密码登录。'}
          </p>
          {inspection.phone_tail ? (
            <p className="text-xs text-muted-foreground">
              提示:管理员档案里你的手机号尾号是 <code className="font-mono">****{inspection.phone_tail}</code>(完整 11 位由你填写,系统会校验)。
            </p>
          ) : null}
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
    expired: '链接已过期(超过 7 天未使用)。',
    consumed: '链接已经使用过,不能重复设置密码。',
  }[reason];
}
