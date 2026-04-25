'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelDispatch } from './actions';

export function CancelButton({
  tenantSlug,
  taskId,
  staffName,
}: {
  tenantSlug: string;
  taskId: string;
  staffName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    if (!confirm(`确认撤回派给「${staffName}」的这条任务?\n暗号会作废,变体回到可派池。`)) return;
    setErr(null);
    start(async () => {
      try {
        await cancelDispatch(tenantSlug, taskId);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '撤回失败');
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title={err ?? '只能撤回 2 小时内派出的任务'}
        className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-rose-700 disabled:opacity-50"
      >
        {pending ? '…' : '撤回'}
      </button>
      {err ? <span className="text-[10px] text-rose-700">{err}</span> : null}
    </span>
  );
}
