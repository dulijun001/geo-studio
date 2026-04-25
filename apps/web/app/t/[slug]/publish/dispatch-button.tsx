'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dispatchToday, type DispatchProposal } from './actions';

const PLATFORM_LABEL: Record<string, string> = {
  toutiao_article: '头条',
  douyin_script: '抖音',
  wechat_mp: '公众号',
  zhihu: '知乎',
  xiaohongshu: '小红书',
  baijiahao: '百家号',
  souhu: '搜狐号',
};

export function DispatchButton({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [proposals, setProposals] = useState<DispatchProposal[] | null>(null);
  const [meta, setMeta] = useState<{ unmatched: number; idle_staff: number }>({
    unmatched: 0,
    idle_staff: 0,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onPreview = () => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await dispatchToday(tenantSlug, false);
        if (r.proposals.length === 0) {
          setMsg('没有可派的新变体 — 可能全部已派,或还没有合规通过的变体。');
          return;
        }
        setProposals(r.proposals);
        setMeta({ unmatched: r.unmatched, idle_staff: r.idle_staff });
      } catch (e) {
        setErr(e instanceof Error ? e.message : '预览失败');
      }
    });
  };

  const onConfirm = () => {
    setErr(null);
    startTransition(async () => {
      try {
        const r = await dispatchToday(tenantSlug, true);
        setProposals(null);
        setMsg(`派单成功:写入 ${r.proposals.length} 条任务,自动 mint ${r.proposals.length * 2} 个钩子。`);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '派单失败');
      }
    });
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={isPending}
          onClick={onPreview}
          className="btn-primary disabled:opacity-60"
        >
          {isPending ? '处理中…' : '派单今日'}
        </button>
        {msg ? (
          <p className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">{msg}</p>
        ) : null}
        {err ? (
          <p className="rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{err}</p>
        ) : null}
      </div>

      {proposals !== null ? (
        <ReviewDialog
          proposals={proposals}
          meta={meta}
          onCancel={() => setProposals(null)}
          onConfirm={onConfirm}
          isPending={isPending}
        />
      ) : null}
    </>
  );
}

function ReviewDialog({
  proposals,
  meta,
  onCancel,
  onConfirm,
  isPending,
}: {
  proposals: DispatchProposal[];
  meta: { unmatched: number; idle_staff: number };
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const byStaff = new Map<string, DispatchProposal[]>();
  for (const p of proposals) {
    const list = byStaff.get(p.staff_name) ?? [];
    list.push(p);
    byStaff.set(p.staff_name, list);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="card-elevated flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden bg-card">
        <header className="flex items-baseline justify-between border-b border-border px-6 py-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold">派单预览</h2>
            <p className="text-xs text-muted-foreground">
              算法分配了 <span className="font-semibold text-foreground">{proposals.length}</span> 条
              · 未匹配 {meta.unmatched} 条 · 空闲员工 {meta.idle_staff} 人
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="取消"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ul className="space-y-3">
            {Array.from(byStaff.entries()).map(([staffName, list]) => (
              <li key={staffName} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 text-sm font-medium">
                  {staffName}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {list[0]?.staff_phone ? maskPhone(list[0].staff_phone) : ''} · {list.length} 条
                  </span>
                </p>
                <ul className="space-y-1.5">
                  {list.map((p, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {PLATFORM_LABEL[p.variant_platform] ?? p.variant_platform}
                      </span>
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {p.time_window === 'morning' ? '上午档' : '下午档'}
                      </span>
                      <span className="line-clamp-1 flex-1">{p.variant_title}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            确认后会自动 mint 暗号 + 医生名钩子,员工立刻能看到任务。
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className="btn-primary disabled:opacity-60"
            >
              {isPending ? '派单中…' : `确认派 ${proposals.length} 条`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function maskPhone(p: string): string {
  if (p.length !== 11) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}
