'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateVariantContent } from '../actions';

export function EditForm({
  tenantSlug,
  variantId,
  initialTitle,
  initialBody,
  disabled,
  disabledReason,
}: {
  tenantSlug: string;
  variantId: string;
  initialTitle: string;
  initialBody: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        await updateVariantContent(tenantSlug, variantId, title, body);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  if (disabled) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        {disabledReason ?? '当前状态不支持编辑文案。'}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
        </svg>
        编辑文案重审
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-elevated space-y-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">编辑文案</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle(initialTitle);
            setBody(initialBody);
            setErr(null);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          取消
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium">标题</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="block w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium">正文</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={14}
          className="block w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs leading-relaxed"
        />
        <span className="block text-[11px] text-muted-foreground">
          {body.length} 字 · 保存会重置合规状态为「待审」并自动重跑三道门
        </span>
      </label>

      <div className="flex items-center justify-end gap-2">
        {err ? <p className="mr-auto text-xs text-rose-700">{err}</p> : null}
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? '保存中…' : '保存并重审'}
        </button>
      </div>
    </form>
  );
}
