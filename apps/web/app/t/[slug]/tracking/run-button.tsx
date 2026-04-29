'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enqueueGeoSnapshot, SUPPORTED_ENGINES } from './actions';

const ENGINE_LABEL: Record<string, string> = {
  doubao: '豆包',
  yuanbao: '元宝',
};

type Engine = (typeof SUPPORTED_ENGINES)[number];

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
  const [engine, setEngine] = useState<Engine>('doubao');

  const onClick = () => {
    setErr(null);
    start(async () => {
      try {
        await enqueueGeoSnapshot(tenantSlug, questionId, engine);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '触发失败');
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={engine}
        onChange={(e) => setEngine(e.target.value as Engine)}
        disabled={pending}
        className="rounded-md border border-border bg-background px-1.5 py-1 text-xs disabled:opacity-50"
      >
        {SUPPORTED_ENGINES.map((e) => (
          <option key={e} value={e}>
            {ENGINE_LABEL[e] ?? e}
          </option>
        ))}
      </select>
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
