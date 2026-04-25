'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enqueueGeoSnapshot } from './actions';

export function RunButton({
  tenantSlug,
  questionId,
}: {
  tenantSlug: string;
  questionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    setErr(null);
    start(async () => {
      try {
        await enqueueGeoSnapshot(tenantSlug, questionId);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '触发失败');
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
      >
        {pending ? '排队中…' : '跑这条'}
      </button>
      {err ? <span className="text-xs text-rose-600">{err}</span> : null}
    </span>
  );
}
