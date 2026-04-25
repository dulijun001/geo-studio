'use client';

import { useState, useTransition } from 'react';
import { dispatchToday } from './actions';

export function DispatchButton({ tenantSlug }: { tenantSlug: string }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      try {
        const r = await dispatchToday(tenantSlug);
        if (r.assigned === 0) {
          setMsg(`没有新任务可派 — 可能全部变体已派过,或员工全部满配额。`);
        } else {
          setMsg(
            `派单成功:分配 ${r.assigned} 条,未匹配 ${r.unmatched} 条,今日空闲员工 ${r.idle_staff} 人。`,
          );
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : '派单失败');
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={onClick}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? '派单中…' : '派单今日'}
      </button>
      {msg ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {err}
        </p>
      ) : null}
    </div>
  );
}
