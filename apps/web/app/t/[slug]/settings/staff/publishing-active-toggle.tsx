'use client';

import { useState, useTransition } from 'react';
import { togglePublishingActive } from './actions';

/**
 * V1.11: 核心发布号开关.
 *
 * is_active=true  → 凌晨 cron 派单候选 (dispatcher H0 过滤)
 * is_active=false → 辅助/潜伏号,不接派单
 *
 * UI 选择 — minimal 切换开关:
 *   - 在岗(active) → 可点击,绿/灰双态
 *   - 暂停/离职 → 禁用并显示原因
 */
export function PublishingActiveToggle({
  tenantSlug,
  staffAccountId,
  initialActive,
  disabled,
  disabledReason,
}: {
  tenantSlug: string;
  staffAccountId: string;
  initialActive: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [active, setActive] = useState(initialActive);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onToggle = () => {
    if (disabled || isPending) return;
    const next = !active;
    setErr(null);
    // Optimistic — flip immediately. Revert on error.
    setActive(next);
    startTransition(async () => {
      try {
        await togglePublishingActive(tenantSlug, staffAccountId, next);
      } catch (e) {
        setActive(!next);
        setErr(e instanceof Error ? e.message : '切换失败');
      }
    });
  };

  if (disabled) {
    return (
      <div title={disabledReason ?? '该员工状态非「在岗」,不能开启派单'}>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          未启用
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        aria-pressed={active}
        title={active ? '点击关闭 — 不再接派单' : '点击开启 — 凌晨 cron 派单候选'}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          active
            ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            : 'border border-border bg-card text-muted-foreground hover:bg-muted'
        } ${isPending ? 'opacity-60' : ''}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            active ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-muted-foreground'
          }`}
        />
        {active ? '核心号 · 接派单' : '辅助号'}
      </button>
      {err ? <span className="text-[10px] text-rose-400">{err}</span> : null}
    </div>
  );
}
