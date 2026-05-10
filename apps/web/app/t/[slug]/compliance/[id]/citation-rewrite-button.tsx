'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { aiRewriteCitations } from '../actions';

export function CitationRewriteButton({
  tenantSlug,
  variantId,
}: {
  tenantSlug: string;
  variantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [changes, setChanges] = useState<string[] | null>(null);

  function onClick() {
    if (
      !confirm(
        'AI 会针对上面的可疑引用做精准改写:KB 有的软化措辞,KB 没有的整段删除。改写后会重新跑合规四道门。继续?',
      )
    )
      return;
    setErr(null);
    setChanges(null);
    start(async () => {
      try {
        const res = await aiRewriteCitations(tenantSlug, variantId);
        if (!res.ok) {
          setErr(res.reason);
          return;
        }
        setChanges(res.changes);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '改写失败');
      }
    });
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
      >
        {pending ? 'AI 改写中…(约 30-60 秒)' : '✨ AI 直接修改这些引用'}
      </button>
      {err ? <p className="text-[11px] text-rose-700">{err}</p> : null}
      {changes && changes.length > 0 ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-[11px] text-emerald-900">
          <div className="font-medium">✓ 改写完成,做了 {changes.length} 处修改:</div>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {changes.slice(0, 5).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
            {changes.length > 5 ? <li>… 还有 {changes.length - 5} 处</li> : null}
          </ul>
          <div className="mt-1 opacity-80">合规审查已重新入队,刷新页面看新状态。</div>
        </div>
      ) : null}
    </div>
  );
}
