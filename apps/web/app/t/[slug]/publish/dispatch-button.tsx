'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  dispatchToday,
  type DispatchProposal,
  type DispatchOverride,
  type EligibleStaff,
} from './actions';

const PLATFORM_LABEL: Record<string, string> = {
  toutiao_article: '头条',
  douyin_script: '抖音',
  wechat_mp: '公众号',
  zhihu: '知乎',
  xiaohongshu: '小红书',
  baijiahao: '百家号',
  souhu: '搜狐号',
};

type UnmatchedDetail = {
  variant_id: string;
  variant_title: string;
  variant_platform: string;
  reason: string;
};

export function DispatchButton({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [proposals, setProposals] = useState<DispatchProposal[] | null>(null);
  const [meta, setMeta] = useState<{ unmatched: number; idle_staff: number }>({
    unmatched: 0,
    idle_staff: 0,
  });
  // DSP-2 — surface per-row unmatched reasons in the preview pane.
  const [unmatchedDetails, setUnmatchedDetails] = useState<UnmatchedDetail[]>([]);
  // MVP swap: roster for client-side per-row staff <select>.
  const [eligibleStaff, setEligibleStaff] = useState<EligibleStaff[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onPreview = () => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await dispatchToday(tenantSlug, false);
        if (r.proposals.length === 0) {
          // Diagnostic — figure out the actual blocker so the message
          // points the admin at the real fix, not a generic "可能..."
          // hand-wave. r.unmatched = variants that couldn't find any
          // matching staff. r.idle_staff = staff who could take more
          // but didn't get matched to any candidate variant.
          if (r.unmatched > 0 && r.idle_staff > 0) {
            setMsg(
              `算法跑通了但 ${r.unmatched} 条变体没匹配上任何员工 · ${r.idle_staff} 个员工今天还能接但没被匹配。多半是「员工平台账号 / persona 标签」和「变体平台 / 主题」对不上 — 去「设置 → 员工管理」给员工补对应平台账号。`,
            );
          } else if (r.unmatched > 0) {
            setMsg(
              `${r.unmatched} 条候选变体都没匹配到员工 — 大概率是「员工平台账号没录」。去「设置 → 员工管理」给每个员工至少录一个平台(toutiao_article / zhihu / douyin_script ...)。`,
            );
          } else {
            setMsg('当前没有"已审通过 + 还没派给任何员工"的新变体可派。先去「内容」生成新变体或在「合规审核」批准 pending 项。');
          }
          return;
        }
        setProposals(r.proposals);
        setMeta({ unmatched: r.unmatched, idle_staff: r.idle_staff });
        setUnmatchedDetails(r.unmatched_details ?? []);
        setEligibleStaff(r.eligible_staff ?? []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '预览失败');
      }
    });
  };

  // Accepts the (possibly edited) proposals; serializes them as overrides so
  // the server uses admin's picks instead of re-running the algorithm.
  const onConfirm = (edited: DispatchProposal[]) => {
    setErr(null);
    startTransition(async () => {
      try {
        const overrides: DispatchOverride[] = edited.map((p) => ({
          variant_id: p.variant_id,
          staff_id: p.staff_id,
          time_window: p.time_window,
        }));
        const r = await dispatchToday(tenantSlug, true, overrides);
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
          <p className="rounded-md bg-emerald-500/[0.10] px-2 py-1 text-[11px] text-emerald-300">{msg}</p>
        ) : null}
        {err ? (
          <p className="rounded-md bg-rose-500/[0.10] px-2 py-1 text-[11px] text-rose-300">{err}</p>
        ) : null}
      </div>

      {proposals !== null ? (
        <ReviewDialog
          proposals={proposals}
          eligibleStaff={eligibleStaff}
          meta={meta}
          unmatchedDetails={unmatchedDetails}
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
  eligibleStaff,
  meta,
  unmatchedDetails,
  onCancel,
  onConfirm,
  isPending,
}: {
  proposals: DispatchProposal[];
  eligibleStaff: EligibleStaff[];
  meta: { unmatched: number; idle_staff: number };
  unmatchedDetails: UnmatchedDetail[];
  onCancel: () => void;
  onConfirm: (edited: DispatchProposal[]) => void;
  isPending: boolean;
}) {
  // Mutable local copy so admin can swap staff per row. Initial = algorithm output.
  const [edited, setEdited] = useState<DispatchProposal[]>(proposals);

  const staffById = useMemo(
    () => new Map(eligibleStaff.map((s) => [s.id, s])),
    [eligibleStaff],
  );

  const swap = (variantId: string, newStaffId: string) => {
    const s = staffById.get(newStaffId);
    if (!s) return;
    setEdited((prev) =>
      prev.map((p) =>
        p.variant_id === variantId
          ? { ...p, staff_id: newStaffId, staff_name: s.name, staff_phone: null }
          : p,
      ),
    );
  };

  // Count edits so admin knows what they changed before committing.
  const editCount = useMemo(
    () => edited.filter((p, i) => p.staff_id !== proposals[i]?.staff_id).length,
    [edited, proposals],
  );

  const byStaff = new Map<string, DispatchProposal[]>();
  for (const p of edited) {
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
                  {list.map((p) => {
                    const platformEligible = eligibleStaff.filter((s) =>
                      s.platforms.includes(p.variant_platform),
                    );
                    const isEdited = p.staff_id !== proposals.find((q) => q.variant_id === p.variant_id)?.staff_id;
                    return (
                      <li key={p.variant_id} className="flex items-baseline gap-2 text-sm">
                        <span className="rounded bg-card px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {PLATFORM_LABEL[p.variant_platform] ?? p.variant_platform}
                        </span>
                        <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {p.time_window === 'morning' ? '上午档' : '下午档'}
                        </span>
                        <span className="line-clamp-1 flex-1">{p.variant_title}</span>
                        <select
                          value={p.staff_id}
                          onChange={(e) => swap(p.variant_id, e.target.value)}
                          className={`rounded-md border bg-background px-1.5 py-0.5 text-[11px] ${
                            isEdited ? 'border-amber-400 text-amber-200' : 'border-border text-muted-foreground'
                          }`}
                          aria-label="选择员工"
                        >
                          {platformEligible.length === 0 ? (
                            <option value={p.staff_id}>{p.staff_name}</option>
                          ) : (
                            platformEligible.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))
                          )}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {unmatchedDetails.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.10] p-3">
              <p className="mb-2 text-sm font-medium text-amber-200">
                ⚠ {unmatchedDetails.length} 条变体没匹配上员工
              </p>
              <ul className="space-y-1.5">
                {unmatchedDetails.slice(0, 8).map((u) => (
                  <li
                    key={u.variant_id}
                    className="flex items-baseline gap-2 text-xs text-amber-200"
                  >
                    <span className="rounded bg-card px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
                      {PLATFORM_LABEL[u.variant_platform] ?? u.variant_platform}
                    </span>
                    <span className="line-clamp-1 flex-1">{u.variant_title}</span>
                    <span className="shrink-0 text-[11px] opacity-80">{u.reason}</span>
                  </li>
                ))}
                {unmatchedDetails.length > 8 && (
                  <li className="text-[11px] text-amber-300/80">
                    …还有 {unmatchedDetails.length - 8} 条 — 派单确认后查看 audit_log 完整列表
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[11px] text-amber-300/80">
                常见原因:员工 platforms 字段没配该平台 / 员工今日已达 daily cap。先到「设置 → 员工管理」检查 platforms 配置。
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {editCount > 0
              ? `已手动调整 ${editCount} 条派单 · 确认后按你的选择写入,绕过算法。`
              : '确认后会自动 mint 暗号 + 医生名钩子,员工立刻能看到任务。'}
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
              onClick={() => onConfirm(edited)}
              disabled={isPending}
              className="btn-primary disabled:opacity-60"
            >
              {isPending ? '派单中…' : `确认派 ${edited.length} 条${editCount > 0 ? `(${editCount} 条手改)` : ''}`}
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
