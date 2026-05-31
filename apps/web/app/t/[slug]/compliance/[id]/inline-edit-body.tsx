'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateVariantContent } from '../actions';
import { HighlightedBody } from './highlighted-body';
import { prettifyMarkdown } from '@geo/shared';

type Finding = {
  keyword_id: string;
  term: string;
  level: 'A' | 'B';
  category: string;
  matched_span: string;
  offset: number;
  context_snippet: string;
};

/**
 * Read view by default; hovering the section surfaces a ✎ button that swaps
 * the highlighted-body for a plain textarea. Saving calls updateVariantContent
 * which resets compliance_status to 'pending' and re-enqueues the four-gate
 * review pipeline.
 *
 * Title editing stays on the (now lower-prominence) EditForm in the side panel
 * — most "after compliance" edits touch the body, not the title.
 */
export function InlineEditBody({
  tenantSlug,
  variantId,
  initialTitle,
  initialBody,
  findings,
  disabled,
  disabledReason,
}: {
  tenantSlug: string;
  variantId: string;
  initialTitle: string;
  initialBody: string;
  findings: Finding[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        await updateVariantContent(tenantSlug, variantId, initialTitle, body);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  const onCancel = () => {
    setBody(initialBody);
    setEditing(false);
    setErr(null);
  };

  if (editing) {
    const dirty = body !== initialBody;
    const onPrettify = () => setBody((prev) => prettifyMarkdown(prev));
    const prettifyDisabled = pending || !body.trim() || prettifyMarkdown(body) === body;
    return (
      <form onSubmit={onSave} className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            正文(编辑中,高亮临时隐藏)
          </h2>
          <div className="flex items-center gap-3">
            {err ? <span className="text-xs text-rose-400">{err}</span> : null}
            <button
              type="button"
              onClick={onPrettify}
              disabled={prettifyDisabled}
              title="把 LLM 单行 markdown 重新排版:### 标题分段、FAQ Q/A 独立成段、数字格式抖动修正"
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h10M4 18h16" />
              </svg>
              美化排版
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending || !dirty}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? '保存中…' : '保存并重审'}
            </button>
          </div>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={28}
          autoFocus
          className="block w-full rounded-md border border-border bg-background px-4 py-3 font-mono text-xs leading-relaxed focus:border-accent focus:outline-none"
        />
        <p className="text-[11px] text-muted-foreground">
          {body.length} 字 · 保存会重置合规状态为「待审」并自动重跑四道门(关键词 → LLM → 历史案例 → 人工)
        </p>
      </form>
    );
  }

  return (
    <section className="group space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">正文(命中红黄高亮)</h2>
        {disabled ? (
          disabledReason ? (
            <span className="text-[11px] text-muted-foreground/70">{disabledReason}</span>
          ) : null
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground opacity-0 transition focus:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
            aria-label="编辑正文并重审"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
            </svg>
            编辑
          </button>
        )}
      </div>
      <div className="rounded-md border border-border bg-background p-5 text-sm leading-relaxed">
        <HighlightedBody body={initialBody} findings={findings} />
      </div>
      {findings.length === 0 ? (
        <p className="text-xs text-muted-foreground">关键词扫描未命中任何词。</p>
      ) : null}
    </section>
  );
}
