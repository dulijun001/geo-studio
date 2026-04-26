'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { forceKnowledgeSync } from './actions';

export function ForceSyncButton({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const onClick = () => {
    setMsg(null);
    start(async () => {
      try {
        await forceKnowledgeSync(tenantSlug);
        setMsg('已入队。下次 worker 心跳(< 5s)就会拉起重扫,扫完后该页面统计会更新。');
        setTimeout(() => router.refresh(), 6000);
      } catch (err) {
        setMsg(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-85 disabled:opacity-50"
      >
        {pending ? '入队中…' : '立即重扫知识库'}
      </button>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
