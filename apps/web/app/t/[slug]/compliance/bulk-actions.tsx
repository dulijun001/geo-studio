'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bulkReviewVariants } from './actions';

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
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

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

  const submit = (verb: 'approve' | 'reject', rationale: string) => {
    setErr(null);
    setMsg(null);
    const variantIds = ids();
    start(async () => {
      try {
        const r = await bulkReviewVariants(tenantSlug, variantIds, verb, rationale);
        setMsg(`成功 ${r.succeeded} 条${r.failed.length > 0 ? ` · 失败 ${r.failed.length} 条` : ''}`);
        if (r.failed.length > 0) {
          console.warn('bulk review failures:', r.failed);
        }
        setShowRejectInput(false);
        setRejectReason('');
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '提交失败');
      }
    });
  };

  if (count === 0) return null;

  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 shadow-md backdrop-blur">
      <span className="text-sm font-medium text-indigo-900">
        已选 {count} 条
      </span>
      {!showRejectInput ? (
        <>
          <button
            type="button"
            onClick={() => submit('approve', '批量人工通过')}
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? '处理中…' : `批量通过 ${count} 条`}
          </button>
          <button
            type="button"
            onClick={() => setShowRejectInput(true)}
            disabled={pending}
            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            批量拒绝
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="拒绝原因(必填,会写进 audit_log)"
            autoFocus
            className="flex-1 min-w-[240px] rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => submit('reject', rejectReason)}
            disabled={pending || rejectReason.trim().length < 3}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
          >
            确认拒绝
          </button>
          <button
            type="button"
            onClick={() => {
              setShowRejectInput(false);
              setRejectReason('');
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            取消
          </button>
        </>
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
