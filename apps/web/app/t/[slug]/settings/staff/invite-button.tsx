'use client';

import { useState, useTransition } from 'react';
import { generateStaffInvite } from './actions';

export function InviteButton({
  tenantSlug,
  staffAccountId,
  disabled,
}: {
  tenantSlug: string;
  staffAccountId: string;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ passcode: string; expires_at: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    setErr(null);
    startTransition(async () => {
      try {
        const r = await generateStaffInvite(tenantSlug, staffAccountId);
        setResult(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '生成失败');
      }
    });
  };

  if (result) {
    const expires = new Date(result.expires_at).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <div className="space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="mr-2 font-medium">访问码</span>
            <code className="rounded bg-white px-2 py-0.5 font-mono text-sm tracking-widest">
              {result.passcode}
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
        <div className="text-[11px] text-emerald-800/80">
          {expires} 前有效 · 仅此一次显示,请立刻转给员工。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={isPending || disabled}
        onClick={onClick}
        className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
      >
        {isPending ? '生成中…' : disabled ? '未录手机' : '生成访问码'}
      </button>
      {err ? <p className="text-xs text-rose-700">{err}</p> : null}
    </div>
  );
}
