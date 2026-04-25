'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteVocab } from './actions';

export function DeleteButton({ tenantSlug, vocabId, term }: { tenantSlug: string; vocabId: string; term: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    if (!confirm(`确认删除词条「${term}」?\n历史 GEO 追踪命中记录会保留(软删),但今后不再参与匹配。`)) {
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await deleteVocab(tenantSlug, vocabId);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '删除失败');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={err ?? undefined}
      className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50 disabled:opacity-50"
    >
      {pending ? '…' : '删除'}
    </button>
  );
}
