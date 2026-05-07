'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rescueVariant } from './actions';

export function RescueButton({
  tenantSlug,
  variantId,
}: {
  tenantSlug: string;
  variantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ newScore: number } | null>(null);

  const onClick = () => {
    setErr(null);
    setDone(null);
    start(async () => {
      const r = await rescueVariant(tenantSlug, variantId);
      if (r.ok) {
        setDone({ newScore: r.new_score });
        router.refresh();
      } else {
        setErr(r.error);
      }
    });
  };

  if (done) {
    return (
      <span className="text-xs text-emerald-400">
        ✓ 新版 {done.newScore} 分,已进合规队列
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'AI 改写中…' : 'AI 救援'}
      </button>
      {err && <span className="text-xs text-rose-400">{err}</span>}
    </span>
  );
}
