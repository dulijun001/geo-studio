'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { manualPassDod } from './actions';

/**
 * D21 / ADR 009 §13.3 — admin manual_pass override.
 *
 * Shows on D21 score card when dod_status='failed'. Admin clicks → modal
 * asks for reason → server action updates dod_status='manual_pass' + audit
 * trail in dod_evidence.override_*.
 *
 * Use case: L2 scored ≥60 + LLM did write 5 FAQ but extractor missed one
 * (different markup pattern), or 4-FAQ article was deemed acceptable by
 * editor. Operator avoids regenerating the whole thing.
 */
export function ManualPassButton({
  tenantSlug,
  contentItemId,
}: {
  tenantSlug: string;
  contentItemId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    start(async () => {
      try {
        await manualPassDod(tenantSlug, contentItemId, reason);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-amber-500/40 bg-amber-500/[0.12] px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/[0.20]"
      >
        ⚙ 管理员手动通过
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold">手动通过 DoD?</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              这条 DoD 自动评估为不通过。你看完之后认为质量 OK,可以手动放行
              — 这条会进派单候选池。**操作会记入审计日志**(谁覆盖、何时、为何)。
            </p>
            <label className="mt-4 block space-y-1">
              <span className="text-xs font-medium">覆盖原因 *(≥4 字)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例:LLM 写了 5 条 FAQ 但 extractor 只抓到 4 条,实际内容达标"
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            {err && (
              <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-2 py-1.5 text-xs text-rose-300">
                {err}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
              >
                取消
              </button>
              <button
                type="button"
                disabled={pending || reason.trim().length < 4}
                onClick={submit}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {pending ? '提交中…' : '确认手动通过'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
