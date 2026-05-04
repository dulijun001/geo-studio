/**
 * E-E-A-T 4-dim breakdown card.
 *
 * Reads an existing geo_score from a content_variant (or any GeoScore source)
 * and re-groups the 9 tactic scores under the E-E-A-T framework. No score
 * changes — pure naming/categorization (V1.7 b2).
 *
 * Drop into the variant detail / rescue / compliance UI as needed.
 */

import type { GeoScore } from '@geo/geo-core';
import { EEAT_LABELS, mapToEeat } from '@geo/geo-core';

export function EeatCard({
  score,
  compact = false,
}: {
  score: GeoScore;
  compact?: boolean;
}) {
  const eeat = mapToEeat(score);
  const total = eeat.expertise.score + eeat.experience.score + eeat.authoritativeness.score + eeat.trustworthiness.score;

  const dims: Array<{ key: keyof typeof eeat; data: typeof eeat.expertise }> = [
    { key: 'expertise', data: eeat.expertise },
    { key: 'experience', data: eeat.experience },
    { key: 'authoritativeness', data: eeat.authoritativeness },
    { key: 'trustworthiness', data: eeat.trustworthiness },
  ];

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
        {dims.map(({ key, data }) => {
          const pct = data.max > 0 ? Math.round((data.score / data.max) * 100) : 0;
          const label = EEAT_LABELS[key];
          // First letter of english label as a small visual anchor (E/E/A/T)
          const initial = label.en.charAt(0);
          return (
            <div key={key} className="rounded-md border border-border bg-card px-2 py-2">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-mono font-semibold text-muted-foreground">
                  {initial}
                </span>
                <span className="truncate text-xs font-medium text-foreground">
                  {label.zh}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-base font-semibold tabular-nums">{data.score}</span>
                <span className="text-[10px] text-muted-foreground">/ {data.max}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-medium">E-E-A-T 维度</h3>
        <span className="text-xs text-muted-foreground">总 {total}/100 · 9 法重新归类映射</span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        {dims.map(({ key, data }) => {
          const pct = data.max > 0 ? Math.round((data.score / data.max) * 100) : 0;
          const label = EEAT_LABELS[key];
          return (
            <div key={key} className="space-y-2 p-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-sm font-medium">{label.zh}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label.en}
                  </div>
                </div>
                <span className="text-base font-semibold">{data.score}/{data.max}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{label.hint}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {data.tactic_keys.map((k) => (
                  <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {k}: {score.breakdown[k].score}/{score.breakdown[k].max}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
