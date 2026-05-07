'use client';

import { useState, useTransition } from 'react';
import { setPublicEnabled, triggerRegenerate } from './actions';

/**
 * Public-enable toggle + URL preview banner.
 *
 * When enabled, shows the four public URLs (so admins can verify in a browser
 * before sharing the links with customers / pasting them into 微信 etc.).
 */
export function PublicToggle({
  tenantSlug,
  enabled,
  publicUrls,
}: {
  tenantSlug: string;
  enabled: boolean;
  publicUrls: { llms: string; llmsFull: string; feed: string; sitemap: string };
}) {
  const [isPending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onToggle = () => {
    setErr(null);
    start(async () => {
      try {
        await setPublicEnabled(tenantSlug, !enabled);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '切换失败');
      }
    });
  };

  return (
    <div
      className={`rounded-md border p-4 ${
        enabled
          ? 'border-emerald-500/30 bg-emerald-500/[0.10]/60'
          : 'border-amber-500/30 bg-amber-500/[0.10]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                enabled ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="text-sm font-medium">
              {enabled ? '公开访问已开启' : '公开访问关闭'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {enabled
              ? '4 个 artifact 对豆包 / 元宝 / Perplexity 等 AI 爬虫公开可读'
              : '关闭状态下,公开 URL 一律返回 404 — 客户没准备好之前不会泄露'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={isPending}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition disabled:opacity-50 ${
            enabled ? 'bg-emerald-500' : 'bg-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 translate-y-[-1px] transform rounded-full bg-white shadow ring-0 transition ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {err && (
        <div className="mt-3 text-xs text-rose-300">{err}</div>
      )}

      {enabled && (
        <div className="mt-3 grid grid-cols-1 gap-1 text-xs lg:grid-cols-2">
          <PublicUrlRow label="llms.txt" url={publicUrls.llms} />
          <PublicUrlRow label="llms-full.txt" url={publicUrls.llmsFull} />
          <PublicUrlRow label="feed.json" url={publicUrls.feed} />
          <PublicUrlRow label="sitemap.xml" url={publicUrls.sitemap} />
        </div>
      )}
    </div>
  );
}

function PublicUrlRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center gap-2 truncate">
      <span className="w-24 shrink-0 font-mono text-muted-foreground">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="truncate font-mono text-foreground/80 underline-offset-2 hover:underline"
      >
        {url}
      </a>
    </div>
  );
}

/**
 * "立即重建" — enqueue worker job for this tenant.
 */
export function RegenerateButton({ tenantSlug }: { tenantSlug: string }) {
  const [isPending, start] = useTransition();
  const [done, setDone] = useState<'idle' | 'enqueued' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    setErr(null);
    setDone('idle');
    start(async () => {
      try {
        await triggerRegenerate(tenantSlug);
        setDone('enqueued');
        setTimeout(() => setDone('idle'), 4000);
      } catch (e) {
        setDone('error');
        setErr(e instanceof Error ? e.message : '重建失败');
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {isPending ? '重建中…' : '立即重建'}
      </button>
      {done === 'enqueued' && (
        <span className="text-xs text-emerald-400">✓ 已入队,worker 几秒内处理</span>
      )}
      {err && <span className="text-xs text-rose-300">{err}</span>}
    </div>
  );
}
