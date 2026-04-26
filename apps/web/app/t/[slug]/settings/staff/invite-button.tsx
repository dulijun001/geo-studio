'use client';

import { useState, useTransition } from 'react';
import { generateStaffSetupLink } from './actions';

/**
 * Per-staff control: generate a one-time setup/reset link. Admin copies it
 * and DMs to the staff member; staff opens it once and sets their password.
 *
 * UI shows two states:
 *   - hasPassword=false → 「邀请链接」button (kind='setup')
 *   - hasPassword=true  → 「重置密码」button (kind='reset', clears existing pwd)
 */
export function InviteButton({
  tenantSlug,
  staffAccountId,
  hasPassword,
  disabled,
}: {
  tenantSlug: string;
  staffAccountId: string;
  hasPassword: boolean;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ url: string; expires_at: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onClick = (kind: 'setup' | 'reset') => {
    setErr(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const r = await generateStaffSetupLink(tenantSlug, staffAccountId, kind);
        setResult(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '生成失败');
      }
    });
  };

  const onCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('复制此链接发给员工:', result.url);
    }
  };

  if (result) {
    const expires = new Date(result.expires_at).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-medium">邀请链接已生成</p>
            <code className="block overflow-x-auto rounded bg-white px-2 py-1 font-mono text-[10px] leading-relaxed">
              {result.url}
            </code>
          </div>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            关闭
          </button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-emerald-800/80">
          <span>{expires} 前有效 · 复制后微信发给员工</span>
          <button
            type="button"
            onClick={onCopy}
            className="rounded border border-emerald-300 bg-white px-2 py-0.5 text-emerald-800 hover:bg-emerald-100"
          >
            {copied ? '已复制 ✓' : '复制链接'}
          </button>
        </div>
      </div>
    );
  }

  if (disabled) {
    return <span className="text-xs text-muted-foreground">未录手机号</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {hasPassword ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => onClick('reset')}
          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
          title="清空原密码,生成新邀请链接让员工重新设置"
        >
          {isPending ? '生成中…' : '重置密码'}
        </button>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => onClick('setup')}
          className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-85 disabled:opacity-60"
        >
          {isPending ? '生成中…' : '邀请链接'}
        </button>
      )}
      {err ? <p className="text-xs text-rose-700">{err}</p> : null}
    </div>
  );
}
