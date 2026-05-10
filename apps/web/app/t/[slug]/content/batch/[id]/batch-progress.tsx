'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { retryBatchItem } from '../actions';

type Batch = {
  id: string;
  total: number;
  succeeded: number;
  failed: number;
  status: string;
  audience: string;
  platforms: string[];
  created_at: string;
  completed_at: string | null;
};

type Item = {
  id: string;
  topic: string;
  platform: string;
  status: string;
  content_item_id: string | null;
  error_msg: string | null;
  attempts: number;
  updated_at: string;
};

const POLL_INTERVAL_MS = 3000;

const PLATFORM_LABEL: Record<string, string> = {
  toutiao_article: '头条',
  wechat_mp: '公众号',
  zhihu: '知乎',
  xiaohongshu: '小红书',
  douyin_script: '抖音',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-white/[0.06] text-muted-foreground',
  running: 'bg-amber-500/[0.12] text-amber-300',
  succeeded: 'bg-emerald-500/[0.12] text-emerald-400',
  failed: 'bg-rose-500/[0.10] text-rose-300 border border-rose-500/30',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  running: '生成中',
  succeeded: '完成',
  failed: '失败',
};

export function BatchProgress({
  tenantSlug,
  batchId,
  initialBatch,
  initialItems,
}: {
  tenantSlug: string;
  batchId: string;
  initialBatch: Batch;
  initialItems: Item[];
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  // Auto-refresh while batch is running. Poll every 3s; stop when terminal.
  useEffect(() => {
    if (initialBatch.status !== 'running') return;
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [initialBatch.status, router]);

  const isTerminal = initialBatch.status !== 'running';
  const inFlight = initialBatch.total - initialBatch.succeeded - initialBatch.failed;
  const pct = Math.round(((initialBatch.succeeded + initialBatch.failed) / initialBatch.total) * 100);

  function onRetry(itemId: string) {
    startRetry(async () => {
      try {
        await retryBatchItem(tenantSlug, itemId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">总进度</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {initialBatch.succeeded + initialBatch.failed} / {initialBatch.total}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                ({pct}%)
              </span>
            </div>
          </div>
          <div className="text-right text-sm">
            <BatchStatusBadge status={initialBatch.status} />
            <div className="mt-1 text-xs text-muted-foreground">
              成功 {initialBatch.succeeded} · 失败 {initialBatch.failed} · 进行中 {inFlight}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-foreground to-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {!isTerminal ? (
          <p className="mt-3 text-xs text-muted-foreground">
            页面每 3 秒自动刷新,你可以离开这个页面,worker 在后台继续跑。
          </p>
        ) : null}
      </div>

      {/* Items list */}
      <div className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-medium">逐条状态</h2>
          <span className="text-xs text-muted-foreground">
            点击 succeeded 项跳到内容详情;失败项可单条重试
          </span>
        </header>
        <ul className="divide-y divide-border">
          {initialItems.map((item) => (
            <li key={item.id} className="grid grid-cols-[8rem_1fr_10rem_5rem] items-center gap-3 px-5 py-3 text-sm">
              <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] ?? 'bg-white/[0.06]'}`}>
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              <div className="min-w-0">
                <div className="line-clamp-1">{item.topic}</div>
                {item.error_msg ? (
                  <div className="mt-0.5 line-clamp-1 text-xs text-rose-400" title={item.error_msg}>
                    {item.error_msg}
                  </div>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">
                {PLATFORM_LABEL[item.platform] ?? item.platform}
                {item.attempts > 1 ? ` · 第 ${item.attempts} 次` : ''}
              </span>
              <div className="text-right">
                {item.status === 'succeeded' && item.content_item_id ? (
                  <Link
                    href={`/t/${tenantSlug}/content/${item.content_item_id}`}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    查看 →
                  </Link>
                ) : item.status === 'failed' ? (
                  <button
                    type="button"
                    disabled={retrying}
                    onClick={() => onRetry(item.id)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    重试
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BatchStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    running: { cls: 'bg-amber-500/[0.12] text-amber-300', label: '运行中' },
    completed: { cls: 'bg-emerald-500/[0.12] text-emerald-400', label: '全部完成' },
    partial: { cls: 'bg-amber-500/[0.10] text-amber-300 border border-amber-500/30', label: '部分失败' },
    failed: { cls: 'bg-rose-500/[0.10] text-rose-300 border border-rose-500/30', label: '全部失败' },
  };
  const m = map[status] ?? { cls: 'bg-white/[0.06] text-muted-foreground', label: status };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}
