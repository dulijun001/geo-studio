'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveVariant, rejectVariant } from '../actions';

type CitationCheck = {
  verdict?: string;
  unmatched?: Array<{ needle: string }>;
} | null;

export function ReviewActions({
  tenantSlug,
  variantId,
  citationCheck,
}: {
  tenantSlug: string;
  variantId: string;
  citationCheck?: CitationCheck;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [rationale, setRationale] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acknowledgedCitations, setAcknowledgedCitations] = useState(false);

  // Surface unverified citations only when present + when approving.
  const unmatched =
    citationCheck?.verdict === 'suspected_hallucination'
      ? citationCheck.unmatched ?? []
      : [];
  const needsCitationAck = unmatched.length > 0;

  function submit() {
    setError(null);
    start(async () => {
      try {
        if (mode === 'approve') {
          await approveVariant(
            tenantSlug,
            variantId,
            rationale.trim() || '合规审查通过',
            needsCitationAck ? { acknowledgeUnverifiedCitations: acknowledgedCitations } : undefined,
          );
        } else if (mode === 'reject') {
          await rejectVariant(tenantSlug, variantId, rationale.trim());
        }
        setMode('idle');
        setRationale('');
        setAcknowledgedCitations(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        // Stale-state recovery: server action may have rejected because the
        // variant transitioned to a terminal state mid-edit (worker review
        // landed while admin was filling rationale). router.refresh() pulls
        // fresh server state; useState is preserved across refresh in Next 14
        // so rationale input survives — user can re-submit if it was a
        // different error. Worst case: a transient error triggers a harmless
        // re-fetch.
        router.refresh();
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
  const isApprove = mode === 'approve';

  // Approve disabled if: pending OR (citation ack required but not checked)
  const approveBlocked = isApprove && needsCitationAck && !acknowledgedCitations;
  const rejectBlocked = isReject && rationale.trim().length < 3;

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

      {/* Citation gate (only on approve when there are unverified mentions) */}
      {isApprove && needsCitationAck ? (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs">
          <p className="font-medium text-amber-900">
            ⚠ {unmatched.length} 处引用未通过白名单核实:
          </p>
          <ul className="space-y-0.5 pl-1 text-amber-900/90">
            {unmatched.slice(0, 5).map((u, i) => (
              <li key={i} className="truncate">
                ・<span className="font-mono">{u.needle}</span>
              </li>
            ))}
            {unmatched.length > 5 && (
              <li className="text-amber-700">+ 还有 {unmatched.length - 5} 处</li>
            )}
          </ul>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-300 bg-white p-2.5">
            <input
              type="checkbox"
              checked={acknowledgedCitations}
              onChange={(e) => setAcknowledgedCitations(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-amber-600"
            />
            <span className="text-amber-900">
              我已手工核实这 {unmatched.length} 处引用真实存在,确认批准发布
            </span>
          </label>
          <p className="pl-1 text-[10px] text-amber-800/70">
            勾选后,操作会写入 audit_logs.action='compliance.approve' + payload.acknowledged_unverified_citations=true,可追溯。
          </p>
        </div>
      ) : null}

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || approveBlocked || rejectBlocked}
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
            setAcknowledgedCitations(false);
          }}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          取消
        </button>
      </div>
    </div>
  );
}
