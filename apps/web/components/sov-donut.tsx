/**
 * Pure-CSS donut chart for SOV (own brand vs competitors).
 * No chart library. Renders a conic-gradient ring + center label.
 */
export function SovDonut({
  ownCount,
  competitorCount,
  size = 120,
}: {
  ownCount: number;
  competitorCount: number;
  size?: number;
}) {
  const total = ownCount + competitorCount;
  const ownPct = total === 0 ? 0 : (ownCount / total) * 100;
  const sov = total === 0 ? null : Math.round(ownPct);
  const ownColor = '#6366f1'; // indigo-500
  const compColor = '#fda4af'; // rose-300

  const ringStyle: React.CSSProperties = {
    width: size,
    height: size,
    background:
      total === 0
        ? `conic-gradient(#e2e8f0 0% 100%)`
        : `conic-gradient(${ownColor} 0% ${ownPct}%, ${compColor} ${ownPct}% 100%)`,
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative flex flex-shrink-0 items-center justify-center rounded-full"
        style={ringStyle}
      >
        <div
          className="flex flex-col items-center justify-center rounded-full bg-card"
          style={{ width: size - 28, height: size - 28 }}
        >
          {sov === null ? (
            <span className="text-xs text-muted-foreground">无数据</span>
          ) : (
            <>
              <span className="text-2xl font-semibold tracking-tight">{sov}%</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">SOV</span>
            </>
          )}
        </div>
      </div>
      <div className="space-y-1.5 text-sm">
        <Legend swatch={ownColor} label="本品牌提及" value={ownCount} />
        <Legend swatch={compColor} label="竞品提及" value={competitorCount} />
        <p className="pt-1 text-xs text-muted-foreground">
          SOV = 本品牌 ÷ (本品牌 + 竞品)
        </p>
      </div>
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: swatch }}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
