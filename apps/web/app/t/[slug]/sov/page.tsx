/**
 * SOV 战况图 — query × 周 的话语权热力图。
 *
 * 「GEO 追踪」是当前快照(每条 query 最近一次跑的结果),这页是**趋势**:
 * 把每条 query 在过去 8 周的 SOV 状态画成热力图,**让运营一眼看到哪些
 * query 在改善、哪些在退步、哪些一直空着**。
 *
 * 数据来源:
 *   - questions:行(按 priority desc)
 *   - geo_snapshots: 周时间窗内的 done snapshot
 *   - citations: 按 term_type 聚合 brand / competitor / doctor 计数
 *
 * 热力图状态判定(per cell = per question per week):
 *   ✅ 守住    brand >= 1, competitor = 0
 *   ⚔️ 拉锯    brand >= 1, competitor >= 1
 *   🔴 失守    brand = 0, competitor >= 1
 *   ⚪ 真空    无任何 mention(snapshot 跑过但没人被提)
 *   —  无数据  当周没跑过 baseline
 */
import Link from 'next/link';
import { requireTenantMember } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Reveal } from '@/components/motion/reveal';

export const dynamic = 'force-dynamic';

const WEEKS_TO_SHOW = 8;

type QuestionRow = {
  id: string;
  text: string;
  priority: number;
  category: string | null;
};

type CellState = 'no_data' | 'vacuum' | 'lost' | 'fight' | 'won';

type Cell = {
  state: CellState;
  brand: number;
  competitor: number;
  doctor: number;
};

type RowData = {
  question: QuestionRow;
  cells: Cell[]; // length = WEEKS_TO_SHOW, oldest first → newest last
};

function startOfWeekUTC(d: Date): Date {
  // Treat ISO weeks: Monday 00:00 UTC. We display weekly buckets aligned
  // with the geo_weekly_baseline schedule (Mon 01:00 UTC).
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = out.getUTCDay() || 7; // 1..7 with Sun → 7
  out.setUTCDate(out.getUTCDate() - (day - 1));
  return out;
}

export default async function SovHeatmapPage({ params }: { params: { slug: string } }) {
  const tenant = await requireTenantMember(params.slug);
  const supabase = createSupabaseServerClient();

  // 1. Load questions(按 priority desc + active 优先)
  const { data: qRaw } = await supabase
    .from('questions')
    .select('id, text, priority, category, active')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('active', { ascending: false })
    .order('priority', { ascending: false })
    .limit(60);
  const questions = (qRaw ?? []) as Array<QuestionRow & { active: boolean }>;
  const activeQuestions = questions.filter((q) => q.active);

  // 2. Compute the 8 weekly window edges. Index 0 = 7 weeks ago, last = current week.
  const now = new Date();
  const currentWeekStart = startOfWeekUTC(now);
  const weekStarts: Date[] = [];
  for (let i = WEEKS_TO_SHOW - 1; i >= 0; i--) {
    const d = new Date(currentWeekStart);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekStarts.push(d);
  }
  const earliest = weekStarts[0]!;

  // 3. Pull all done snapshots in window for these questions, with citations.
  const qIds = activeQuestions.map((q) => q.id);
  const { data: snapsRaw } = qIds.length
    ? await supabase
        .from('geo_snapshots')
        .select('id, question_id, asked_at, created_at, status')
        .eq('tenant_id', tenant.id)
        .in('question_id', qIds)
        .eq('status', 'done')
        .gte('created_at', earliest.toISOString())
        .order('created_at', { ascending: false })
    : { data: [] };

  type Snap = {
    id: string;
    question_id: string;
    asked_at: string | null;
    created_at: string;
  };
  const snaps = (snapsRaw ?? []) as Snap[];

  const { data: citsRaw } =
    snaps.length > 0
      ? await supabase
          .from('citations')
          .select('snapshot_id, term_type')
          .in(
            'snapshot_id',
            snaps.map((s) => s.id),
          )
      : { data: [] };
  type Cit = { snapshot_id: string; term_type: string | null };
  const cits = (citsRaw ?? []) as Cit[];

  const citCountsBySnap = new Map<string, { brand: number; competitor: number; doctor: number }>();
  for (const c of cits) {
    const cur = citCountsBySnap.get(c.snapshot_id) ?? { brand: 0, competitor: 0, doctor: 0 };
    if (c.term_type === 'brand') cur.brand++;
    else if (c.term_type === 'competitor') cur.competitor++;
    else if (c.term_type === 'doctor') cur.doctor++;
    citCountsBySnap.set(c.snapshot_id, cur);
  }

  // 4. For each question, build 8 cells. If multiple snaps in same week, take latest.
  const rows: RowData[] = activeQuestions.map((q) => {
    const cells: Cell[] = weekStarts.map(() => ({
      state: 'no_data' as CellState,
      brand: 0,
      competitor: 0,
      doctor: 0,
    }));

    for (const s of snaps) {
      if (s.question_id !== q.id) continue;
      const askedAt = new Date(s.asked_at ?? s.created_at);
      // Find which week bucket this snap lands in
      let bucketIdx = -1;
      for (let i = 0; i < weekStarts.length; i++) {
        const start = weekStarts[i]!;
        const end =
          i === weekStarts.length - 1 ? new Date(start.getTime() + 8 * 86400_000) : weekStarts[i + 1]!;
        if (askedAt >= start && askedAt < end) {
          bucketIdx = i;
          break;
        }
      }
      if (bucketIdx < 0) continue;
      const cell = cells[bucketIdx]!;
      // If we already have a snap in this week, prefer the more recent one
      // — but since snaps come ordered DESC by created_at, the first hit
      // *is* the most recent, so skip if cell is already populated.
      if (cell.state !== 'no_data') continue;
      const counts = citCountsBySnap.get(s.id) ?? { brand: 0, competitor: 0, doctor: 0 };
      cell.brand = counts.brand;
      cell.competitor = counts.competitor;
      cell.doctor = counts.doctor;
      cell.state = stateFor(counts);
    }

    return { question: q, cells };
  });

  // 5. Top-of-page rollup: total SOV per week across all rows
  const weeklyRollup = weekStarts.map((_, i) => {
    let brand = 0;
    let comp = 0;
    let coverage = 0;
    for (const r of rows) {
      const c = r.cells[i]!;
      if (c.state !== 'no_data') {
        coverage += 1;
        brand += c.brand;
        comp += c.competitor;
      }
    }
    const sov = brand + comp > 0 ? Math.round((brand / (brand + comp)) * 100) : null;
    return { brand, comp, sov, coverage, total: rows.length };
  });

  // Hero metric: 当前周 SOV vs 上周 SOV 变化
  const currentSov = weeklyRollup[weeklyRollup.length - 1]?.sov ?? null;
  const lastWeekSov = weeklyRollup[weeklyRollup.length - 2]?.sov ?? null;
  const sovDelta =
    currentSov !== null && lastWeekSov !== null
      ? currentSov - lastWeekSov
      : null;
  const totalCoverage = weeklyRollup.reduce((sum, w) => sum + w.coverage, 0);
  const totalPossible = weeklyRollup.reduce((sum, w) => sum + w.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SOV 战况图"
        subtitle={`Query × 周 热力图 · 过去 ${WEEKS_TO_SHOW} 周 · 每周一 09:00 自动 baseline · 数据来自豆包真人模拟抓取`}
      />

      <InlineGuide
        storageKey={`guide:sov:${tenant.slug}`}
        title="这页是干嘛的"
        body={'看你品牌在豆包答案里的"话语权"趋势。"GEO 追踪"页是当前快照,这页是 8 周趋势 — 哪些 query 在改善 / 退步 / 一直空着,一眼可见。每周一早 9 点自动跑一轮 baseline。'}
        steps={[
          '✅ 守住 = 你被提到 + 竞品没被提到,稳住',
          '⚔️ 拉锯 = 你和竞品都被提到,争夺中,可针对性加内容',
          '🔴 失守 = 只竞品被提到 — 紧急,补内容 / 加 schema / 救援老变体',
          '⚪ 真空 = 谁都没被提到 — 这条 query 整体冷,大家没卷,你抢机会',
        ]}
      />

      {/* Hero metric — 暗色舞台跟 dashboard 主战场一致 */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 md:p-9"
        style={{
          background: '#08090a',
          boxShadow:
            '0 28px 60px -20px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
          style={{ background: 'rgba(52,211,153,0.22)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage:
              'radial-gradient(ellipse 80% 70% at 70% 0%, black 30%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 80% 70% at 70% 0%, black 30%, transparent 100%)',
          }}
        />
        <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <div
              className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em]"
              style={{ color: '#34d399' }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: '#34d399',
                  boxShadow: '0 0 0 3px rgba(52,211,153,0.2)',
                }}
              />
              本周 SOV · 整体话语权
            </div>
            <div className="mt-4 flex items-baseline gap-3">
              <span
                className="text-7xl tabular-nums tracking-[-0.04em] md:text-8xl"
                style={{
                  fontStyle: 'italic',
                  fontWeight: 500,
                  backgroundImage:
                    'linear-gradient(135deg, #fafafa 0%, #34d399 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {currentSov === null ? (
                '—'
              ) : (
                <AnimatedNumber value={currentSov} decimals={0} />
              )}
              </span>
              {currentSov !== null ? (
                <span className="pb-2 text-3xl" style={{ color: '#a1a1aa' }}>
                  %
                </span>
              ) : null}
              {sovDelta !== null ? (
                <span
                  className="ml-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    border:
                      sovDelta >= 0
                        ? '1px solid rgba(52,211,153,0.30)'
                        : '1px solid rgba(251,113,133,0.30)',
                    background:
                      sovDelta >= 0
                        ? 'rgba(52,211,153,0.10)'
                        : 'rgba(251,113,133,0.10)',
                    color: sovDelta >= 0 ? '#34d399' : '#fb7185',
                  }}
                >
                  {sovDelta >= 0 ? '↑' : '↓'} {Math.abs(sovDelta)}pt vs 上周
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm" style={{ color: '#a1a1aa' }}>
              过去 {WEEKS_TO_SHOW} 周累计抓取{' '}
              <span
                className="font-semibold tabular-nums"
                style={{ color: '#fafafa' }}
              >
                {totalCoverage}
              </span>{' '}
              次 / {totalPossible} 次预定 · 覆盖率{' '}
              <span
                className="font-semibold tabular-nums"
                style={{ color: '#fafafa' }}
              >
                {totalPossible > 0
                  ? Math.round((totalCoverage / totalPossible) * 100)
                  : 0}
                %
              </span>
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <Link
              href={`/t/${tenant.slug}/tracking`}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition"
              style={{
                color: '#fafafa',
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              去 GEO 追踪 ↗
            </Link>
            <Link
              href={`/t/${tenant.slug}/citations`}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
              style={{ background: '#fafafa', color: '#0a0a0a' }}
            >
              看引用源 →
            </Link>
          </div>
        </div>
      </section>

      {/* Top rollup — overall SOV trend (8 周分布) */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          每周整体话语权
        </h2>
        <div className="grid grid-cols-8 gap-2">
          {weekStarts.map((start, i) => {
            const w = weeklyRollup[i]!;
            const label = `${start.getUTCMonth() + 1}/${start.getUTCDate()}`;
            const isCurrent = i === weekStarts.length - 1;
            return (
              <div
                key={i}
                className="rounded-lg p-2.5 text-center text-xs transition"
                style={{
                  border: isCurrent
                    ? '1px solid rgba(52,211,153,0.40)'
                    : '1px solid rgba(255,255,255,0.06)',
                  background: isCurrent
                    ? 'rgba(52,211,153,0.08)'
                    : 'rgba(255,255,255,0.02)',
                  boxShadow: isCurrent
                    ? '0 0 16px rgba(52,211,153,0.15)'
                    : 'none',
                }}
              >
                <div className="text-[10px] text-muted-foreground">第 {i + 1} 周</div>
                <div className="font-mono text-[10px] text-muted-foreground">{label}</div>
                <div
                  className="mt-1 text-lg font-semibold tabular-nums"
                  style={{
                    color: isCurrent ? '#34d399' : 'inherit',
                  }}
                >
                  {w.sov === null ? '—' : `${w.sov}%`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {w.coverage}/{w.total} 抓
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          SOV = 松鼠提及 / (松鼠 + 竞品)。无数据时显示 —。覆盖数 = 当周成功抓回的 query 数。
        </p>
      </section>

      {/* Heatmap */}
      {rows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
          还没有 active question。先到「GEO 追踪」页加几条 query。
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Query × 周 热力图
            </h2>
            <Legend />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-normal">
                    Query
                  </th>
                  <th className="bg-card px-1 py-2 text-center font-normal">P</th>
                  {weekStarts.map((s, i) => {
                    const isCurrent = i === weekStarts.length - 1;
                    return (
                      <th
                        key={i}
                        className={`px-1 py-2 text-center font-mono font-normal ${
                          isCurrent ? 'text-emerald-400' : ''
                        }`}
                      >
                        {s.getUTCMonth() + 1}/{s.getUTCDate()}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.question.id} className="transition hover:bg-white/[0.02]">
                    <td className="sticky left-0 z-10 max-w-xs truncate border-t border-border bg-card px-2 py-1.5">
                      <Link
                        href={`/t/${tenant.slug}/tracking#q-${r.question.id}`}
                        className="hover:text-emerald-400 hover:underline underline-offset-2"
                        title={r.question.text}
                      >
                        {r.question.text}
                      </Link>
                      {r.question.category && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          /{r.question.category}
                        </span>
                      )}
                    </td>
                    <td className="border-t border-border px-1 py-1.5 text-center font-mono text-[10px] text-muted-foreground">
                      {r.question.priority}
                    </td>
                    {r.cells.map((c, i) => (
                      <td key={i} className="border-t border-border p-0.5">
                        <CellChip cell={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function stateFor(counts: { brand: number; competitor: number; doctor: number }): CellState {
  if (counts.brand === 0 && counts.competitor === 0 && counts.doctor === 0) return 'vacuum';
  if (counts.brand > 0 && counts.competitor === 0) return 'won';
  if (counts.brand > 0 && counts.competitor > 0) return 'fight';
  // brand == 0 && competitor > 0
  return 'lost';
}

function CellChip({ cell }: { cell: Cell }) {
  if (cell.state === 'no_data') {
    return (
      <div
        className="h-7 w-full rounded-md"
        style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px dashed rgba(255,255,255,0.04)',
        }}
        title="本周无 baseline 数据"
      />
    );
  }
  const config: Record<
    Exclude<CellState, 'no_data'>,
    { bg: string; border: string; glow: string; color: string; emoji: string; label: string }
  > = {
    won: {
      bg: 'rgba(52,211,153,0.18)',
      border: '1px solid rgba(52,211,153,0.45)',
      glow: '0 0 12px rgba(52,211,153,0.3) inset',
      color: '#34d399',
      emoji: '✓',
      label: '守住',
    },
    fight: {
      bg: 'rgba(56,189,248,0.18)',
      border: '1px solid rgba(56,189,248,0.45)',
      glow: '0 0 12px rgba(56,189,248,0.25) inset',
      color: '#7dd3fc',
      emoji: '⚔',
      label: '拉锯',
    },
    lost: {
      bg: 'rgba(251,113,133,0.18)',
      border: '1px solid rgba(251,113,133,0.45)',
      glow: '0 0 12px rgba(251,113,133,0.25) inset',
      color: '#fda4af',
      emoji: '✕',
      label: '失守',
    },
    vacuum: {
      bg: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      glow: 'none',
      color: 'rgba(255,255,255,0.35)',
      emoji: '·',
      label: '真空',
    },
  };
  const c = config[cell.state];
  const tooltip = `${c.label}  brand=${cell.brand} comp=${cell.competitor}${cell.doctor > 0 ? ` doc=${cell.doctor}` : ''}`;
  return (
    <div
      className="flex h-7 w-full items-center justify-center rounded-md font-mono text-[10px] font-medium transition-all"
      style={{
        background: c.bg,
        border: c.border,
        boxShadow: c.glow,
        color: c.color,
      }}
      title={tooltip}
    >
      {cell.brand > 0 || cell.competitor > 0 ? (
        <span>
          {cell.brand}
          <span className="opacity-50">:</span>
          {cell.competitor}
        </span>
      ) : (
        <span className="opacity-70">{c.emoji}</span>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10.5px] text-muted-foreground">
      <LegendChip bg="rgba(52,211,153,0.18)" border="rgba(52,211,153,0.45)" label="✓ 守住" />
      <LegendChip bg="rgba(56,189,248,0.18)" border="rgba(56,189,248,0.45)" label="⚔ 拉锯" />
      <LegendChip bg="rgba(251,113,133,0.18)" border="rgba(251,113,133,0.45)" label="✕ 失守" />
      <LegendChip bg="rgba(255,255,255,0.04)" border="rgba(255,255,255,0.06)" label="· 真空" />
      <LegendChip bg="rgba(255,255,255,0.025)" border="rgba(255,255,255,0.04)" label="无数据" dashed />
    </div>
  );
}

function LegendChip({
  bg,
  border,
  label,
  dashed,
}: {
  bg: string;
  border: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{
          background: bg,
          border: dashed ? `1px dashed ${border}` : `1px solid ${border}`,
        }}
      />
      {label}
    </span>
  );
}
