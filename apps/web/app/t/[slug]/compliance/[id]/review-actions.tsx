'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveVariant, rejectVariant } from '../actions';

export function ReviewActions({
  tenantSlug,
  variantId,
}: {
  tenantSlug: string;
  variantId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [rationale, setRationale] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      try {
        if (mode === 'approve') {
          await approveVariant(tenantSlug, variantId, rationale.trim() || '合规审查通过');
        } else if (mode === 'reject') {
          await rejectVariant(tenantSlug, variantId, rationale.trim());
        }
        setMode('idle');
        setRationale('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (mode === 'idle') {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">人工审批</h2>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setMode('approve')}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            批准发布
          </button>
          <button
            type="button"
            onClick={() => setMode('reject')}
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
          >
            拒绝
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          所有决定会写入 audit_logs(保留 ≥ 3 年)。
        </p>
      </div>
    );
  }

  const isReject = mode === 'reject';
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        {isReject ? '拒绝理由(必填)' : '审批说明(可选)'}
      </h2>
      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={4}
        placeholder={
          isReject
            ? '例:标题含"最佳",违反广告法 §9(3),退回运营改写'
            : '例:文案科普导向,无广告违规,批准发布'
        }
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || (isReject && rationale.trim().length < 3)}
          onClick={submit}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            isReject ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {pending ? '提交中…' : isReject ? '确认拒绝' : '确认批准'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMode('idle');
            setRationale('');
            setError(null);
          }}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          取消
        </button>
      </div>
    </div>
  );
}
