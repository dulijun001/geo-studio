'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { aiRewriteForGeoScore, aiRewriteVariant } from '../actions';

export type RewriteMode = 'compliance' | 'geo_score';

const MODE_COPY: Record<RewriteMode, { dialogTitle: string; dialogBody: string }> = {
  compliance: {
    dialogTitle: '确认让 AI 改写违规内容?',
    dialogBody:
      'AI 会基于关键词扫描的违规位置 + LLM 评审意见做替换,大约 60-120 秒。原正文写入 audit_logs 可回溯,合规状态重置 pending。仅适用于「已拒绝」状态的变体。',
  },
  geo_score: {
    dialogTitle: '确认让 AI 针对最弱 3 项改写?',
    dialogBody:
      '系统会用 GEO 9 法评分里最弱的 3 项作为具体提示让 LLM 重写,大约 60-120 秒。改写不引入合规违规词,改完后重新走四道门审核。原正文写入 audit_logs 可回溯。',
  },
};

/**
 * Inline compact CTA used in the GeoScorePanel weakest-tactics banner.
 *
 *   mode='compliance' — drives the violation-fixing rewrite (existing
 *                        aiRewriteVariant action). Locked to rejected.
 *   mode='geo_score'  — drives the GEO-score-lift rewrite (new
 *                        aiRewriteForGeoScore action). Works on any
 *                        non-final state.
 */
export function InlineAiRewriteCta({
  tenantSlug,
  variantId,
  mode,
  className = '',
}: {
  tenantSlug: string;
  variantId: string;
  mode: RewriteMode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onConfirm = () => {
    setErr(null);
    setConfirmOpen(false);
    start(async () => {
      try {
        const action = mode === 'compliance' ? aiRewriteVariant : aiRewriteForGeoScore;
        const result = await action(tenantSlug, variantId);
        if (!result.ok) {
          setErr(result.reason);
          return;
        }
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const copy = MODE_COPY[mode];

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[11px] font-medium disabled:opacity-50 ${className}`}
      >
        {pending ? '改写中…' : '⚡ AI 一键改写'}
      </button>
      {err ? (
        <span className="text-[11px] text-rose-700">{err}</span>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setConfirmOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-lg bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-sm font-semibold">{copy.dialogTitle}</h3>
            <p className="mt-2 text-xs text-muted-foreground">{copy.dialogBody}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
              >
                开始改写
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AiRewriteButton({
  tenantSlug,
  variantId,
}: {
  tenantSlug: string;
  variantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onConfirm = () => {
    setErr(null);
    setConfirmOpen(false);
    start(async () => {
      try {
        const result = await aiRewriteVariant(tenantSlug, variantId);
        if (!result.ok) {
          setErr(result.reason);
          return;
        }
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">AI 自动改写</h2>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        className="w-full rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {pending ? 'AI 正在改写,通常 60-120s…' : '让 AI 改写一版(自动重交合规)'}
      </button>
      <p className="text-[11px] text-muted-foreground">
        AI 会基于关键词扫描的违规位置 + LLM 评审意见做替换,改写后重新走三道门。
        原文保留在 audit_logs(可回退)。
      </p>
      {err ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {err}
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold">确认让 AI 改写?</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              当前正文会被覆盖,合规状态重置为 pending。原文写入 audit_logs 可回溯。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
              >
                开始改写
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
