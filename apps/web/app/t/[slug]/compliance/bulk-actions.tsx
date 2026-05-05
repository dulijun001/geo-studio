'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bulkReviewVariants, inspectBulkHallucinations } from './actions';

/**
 * Bulk-approval toolbar that appears on the pending tab. Drives the row
 * checkboxes via a tiny store on window — pages render checkboxes whose change
 * handler dispatches a CustomEvent. Avoids lifting state up through the
 * server-rendered table.
 */
export function BulkActions({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [acknowledgeHallucinations, setAcknowledgeHallucinations] = useState(false);
  const [hallucinationPeek, setHallucinationPeek] = useState<
    { id: string; title: string; unmatched: number }[] | null
  >(null);

  // Listen for selection changes from row checkboxes.
  if (typeof window !== 'undefined') {
    window.__geoBulkRefresh = () => {
      const selected = document.querySelectorAll<HTMLInputElement>(
        'input[data-bulk-variant]:checked',
      );
      setCount(selected.length);
    };
  }

  const ids = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>('input[data-bulk-variant]:checked'),
    ).map((el) => el.dataset.bulkVariant!);

  const enterMode = (verb: 'approve' | 'reject') => {
    setErr(null);
    setMsg(null);
    setMode(verb);
    setReason('');
    setAcknowledgeHallucinations(false);
    // CMP-1 — peek which selected variants have suspected_hallucination so
    // the operator decides up-front whether to acknowledge them, instead of
    // discovering N rows silently failed after submit.
    const variantIds = ids();
    inspectBulkHallucinations(tenantSlug, variantIds)
      .then(setHallucinationPeek)
      .catch(() => setHallucinationPeek(null));
  };

  const submit = (verb: 'approve' | 'reject', rationale: string) => {
    setErr(null);
    setMsg(null);
    const variantIds = ids();
    start(async () => {
      try {
        const r = await bulkReviewVariants(
          tenantSlug,
          variantIds,
          verb,
          rationale,
          { acknowledgeUnverifiedCitations: acknowledgeHallucinations },
        );
        const failedSummary =
          r.failed.length > 0
            ? ` · 失败 ${r.failed.length} 条:` +
              r.failed
                .slice(0, 3)
                .map((f) => f.error.slice(0, 30))
                .join(' / ') +
              (r.failed.length > 3 ? '…' : '')
            : '';
        setMsg(`成功 ${r.succeeded} 条${failedSummary}`);
        if (r.failed.length > 0) {
          console.warn('bulk review failures:', r.failed);
        }
        setMode('idle');
        setReason('');
        setHallucinationPeek(null);
        setAcknowledgeHallucinations(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '提交失败');
      }
    });
  };

  const cancelMode = () => {
    setMode('idle');
    setReason('');
    setHallucinationPeek(null);
    setAcknowledgeHallucinations(false);
  };

  if (count === 0) return null;

  const verbZh = mode === 'approve' ? '通过' : mode === 'reject' ? '拒绝' : '';
  const reasonValid = reason.trim().length >= 10;
  const hallucinationCount = hallucinationPeek?.length ?? 0;
  const hallucinationGate =
    mode === 'approve' && hallucinationCount > 0 && !acknowledgeHallucinations;

  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 shadow-md backdrop-blur">
      <span className="text-sm font-medium text-indigo-900">已选 {count} 条</span>
      {mode === 'idle' ? (
        <>
          <button
            type="button"
            onClick={() => enterMode('approve')}
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            批量通过 {count} 条
          </button>
          <button
            type="button"
            onClick={() => enterMode('reject')}
            disabled={pending}
            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            批量拒绝
          </button>
        </>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {hallucinationCount > 0 && mode === 'approve' && (
            <div className="rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <p className="font-medium">
                ⚠ 这一批 {count} 条里有 {hallucinationCount} 条含可疑引用(白名单未匹配)
              </p>
              <ul className="mt-1 ml-4 list-disc space-y-0.5 text-[11px] opacity-90">
                {hallucinationPeek!.slice(0, 3).map((h) => (
                  <li key={h.id}>
                    {h.title}({h.unmatched} 处)
                  </li>
                ))}
                {hallucinationCount > 3 && <li>…还有 {hallucinationCount - 3} 条</li>}
              </ul>
              <label className="mt-2 flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={acknowledgeHallucinations}
                  onChange={(e) => setAcknowledgeHallucinations(e.target.checked)}
                />
                <span>我已手工核实这些引用真实存在,理解并承担批准后果</span>
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`${verbZh}原因(≥10 字,会写进每条 audit_log)`}
              autoFocus
              className={`flex-1 min-w-[280px] rounded-md border bg-white px-3 py-1.5 text-xs ${
                mode === 'reject' ? 'border-rose-300' : 'border-emerald-300'
              }`}
            />
            <button
              type="button"
              onClick={() => submit(mode, reason)}
              disabled={pending || !reasonValid || hallucinationGate}
              className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
                mode === 'reject'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {pending ? '处理中…' : `确认${verbZh} ${count} 条`}
            </button>
            <button
              type="button"
              onClick={cancelMode}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {msg ? <span className="text-xs text-emerald-800">{msg}</span> : null}
      {err ? <span className="text-xs text-rose-700">{err}</span> : null}
    </div>
  );
}

export function BulkCheckbox({ variantId }: { variantId: string }) {
  return (
    <input
      type="checkbox"
      data-bulk-variant={variantId}
      onChange={() => window.__geoBulkRefresh?.()}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-border accent-indigo-600"
      aria-label="选择此变体进行批量操作"
    />
  );
}

declare global {
  interface Window {
    __geoBulkRefresh?: () => void;
  }
}
