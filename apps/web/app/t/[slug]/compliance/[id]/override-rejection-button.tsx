'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { overrideRejection } from '../actions';

const CONFIRM_TOKEN = 'OVERRIDE';

/**
 * Manual-override entry for rejected variants. Visual treatment intentionally
 * different from the standard "批准发布" button — deeper red border, ⚠️ icon,
 * a 2-step confirm (≥20-char rationale + literal "OVERRIDE" typed). Each step
 * exists to slow down accidental rescues of content the compliance gate
 * caught for a good reason.
 */
export function OverrideRejectionButton({
  tenantSlug,
  variantId,
}: {
  tenantSlug: string;
  variantId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rationale, setRationale] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rationaleLen = rationale.trim().length;
  const tokenOk = confirmText.trim() === CONFIRM_TOKEN;
  const canSubmit = rationaleLen >= 20 && tokenOk;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        await overrideRejection(tenantSlug, variantId, rationale);
        setOpen(false);
        setRationale('');
        setConfirmText('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : '翻案失败');
        // Same stale-state recovery as ReviewActions — refresh server state
        // so the user immediately sees the true current state (e.g. someone
        // else just AI-rewrote this row and it's no longer rejected).
        router.refresh();
      }
    });
  };

  const onCancel = () => {
    setOpen(false);
    setRationale('');
    setConfirmText('');
    setError(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-rose-400/60 bg-transparent px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
      >
        <span>⚠️</span>
        <span>人工 override 批准(危险操作)</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border-2 border-rose-400/70 bg-rose-500/5 p-3"
    >
      <div className="space-y-1 text-xs text-rose-200">
        <p className="font-semibold">⚠️ 你正在「翻案」一条被合规系统拒绝的文案</p>
        <p className="opacity-90">
          使用场景:你确认这条内容真实合规,系统误判(如关键词上下文豁免、法务已邮件签字)。
          所有 override 都进 audit_logs,保留 3 年。
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-rose-200">
          翻案理由(≥ 20 字必填,监管可读)
        </span>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          required
          placeholder='例:正文「百分百」指市场份额数据非疗效断言,法务已邮件确认 2026-05-11'
          className="block w-full rounded-md border border-rose-400/40 bg-background px-2 py-1.5 text-xs"
        />
        <span className={`text-[10px] ${rationaleLen >= 20 ? 'text-emerald-400' : 'text-rose-300/70'}`}>
          {rationaleLen} / 20 字
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-rose-200">
          输入 <code className="rounded bg-rose-500/30 px-1 font-mono text-rose-100">{CONFIRM_TOKEN}</code>{' '}
          确认
        </span>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="block w-full rounded-md border border-rose-400/40 bg-background px-2 py-1.5 font-mono text-xs"
        />
      </label>

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="flex-1 rounded-md bg-rose-700 px-3 py-2 text-xs font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? '翻案中…' : '确认 override 批准'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </form>
  );
}
