/**
 * Horizontal bar funnel — width is proportional to step value vs the top step.
 * Pure CSS, no chart library. Falls back to "暂无数据" if every step is zero.
 */
export type FunnelStep = {
  label: string;
  value: number;
  /** Optional override note shown to the right of the value (e.g. "vs 上周 +12%"). */
  hint?: string;
};

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  const allZero = steps.every((s) => s.value === 0);

  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const pct = (s.value / max) * 100;
        const dropFromPrev =
          i > 0 && (steps[i - 1]?.value ?? 0) > 0
            ? Math.round((s.value / (steps[i - 1]?.value ?? 1)) * 100)
            : null;
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">{s.label}</span>
              <span className="text-muted-foreground">
                {s.hint ? <span className="mr-2">{s.hint}</span> : null}
                {dropFromPrev !== null ? (
                  <span className="mr-2 text-slate-400">
                    {dropFromPrev}% ↓
                  </span>
                ) : null}
                <span className="font-semibold text-foreground">{s.value}</span>
              </span>
            </div>
            <div className="h-7 w-full overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md gradient-brand transition-all"
                style={{ width: allZero ? '4%' : `${Math.max(pct, 2)}%`, opacity: allZero ? 0.2 : 1 }}
              />
            </div>
          </div>
        );
      })}
      {allZero ? (
        <p className="pt-2 text-center text-xs text-muted-foreground">
          还没有任何转化事件 — 等患者通过暗号在 checkin 页登记后,这里会出现完整漏斗。
        </p>
      ) : null}
    </div>
  );
}
