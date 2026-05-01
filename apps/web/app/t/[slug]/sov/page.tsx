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

      {/* Top rollup — overall SOV trend */}
      <section className="card-surface space-y-3 p-5">
        <h2 className="text-sm font-medium">每周整体话语权</h2>
        <div className="grid grid-cols-8 gap-2">
          {weekStarts.map((start, i) => {
            const w = weeklyRollup[i]!;
            const label = `${start.getUTCMonth() + 1}/${start.getUTCDate()}`;
            const isCurrent = i === weekStarts.length - 1;
            return (
              <div
                key={i}
                className={`rounded-md border p-2 text-center text-xs ${
                  isCurrent ? 'border-foreground bg-foreground/5' : 'border-border bg-muted/20'
                }`}
              >
                <div className="text-[10px] text-muted-foreground">第 {i + 1} 周</div>
                <div className="font-mono text-[10px] text-muted-foreground">{label}</div>
                <div className="mt-1 text-lg font-semibold">
                  {w.sov === null ? '—' : `${w.sov}%`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {w.coverage}/{w.total} 抓
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          SOV = 松鼠提及 / (松鼠 + 竞品)。无数据时显示 —。覆盖数 = 当周成功抓回的 query 数。
        </p>
      </section>

      {/* Heatmap */}
      {rows.length === 0 ? (
        <section className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          还没有 active question。先到「GEO 追踪」页加几条 query。
        </section>
      ) : (
        <section className="card-surface p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Query × 周 热力图</h2>
            <Legend />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-background px-2 py-2 text-left font-normal">
                    Query
                  </th>
                  <th className="bg-background px-1 py-2 text-center font-normal">P</th>
                  {weekStarts.map((s, i) => {
                    const isCurrent = i === weekStarts.length - 1;
                    return (
                      <th
                        key={i}
                        className={`px-1 py-2 text-center font-normal ${
                          isCurrent ? 'text-foreground' : ''
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
                  <tr key={r.question.id} className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 max-w-xs truncate border-t border-border bg-background px-2 py-1.5">
                      <Link
                        href={`/t/${tenant.slug}/tracking#q-${r.question.id}`}
                        className="hover:underline"
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
    return <div className="h-7 w-full rounded-sm bg-muted/40" title="本周无 baseline 数据" />;
  }
  const config: Record<Exclude<CellState, 'no_data'>, { bg: string; emoji: string; label: string }> = {
    won: { bg: 'bg-emerald-200/70 hover:bg-emerald-300', emoji: '✓', label: '守住' },
    fight: { bg: 'bg-sky-200/70 hover:bg-sky-300', emoji: '⚔', label: '拉锯' },
    lost: { bg: 'bg-rose-200/70 hover:bg-rose-300', emoji: '✕', label: '失守' },
    vacuum: { bg: 'bg-muted hover:bg-muted/80', emoji: '·', label: '真空' },
  };
  const c = config[cell.state];
  const tooltip = `${c.label}  brand=${cell.brand} comp=${cell.competitor}${cell.doctor > 0 ? ` doc=${cell.doctor}` : ''}`;
  return (
    <div
      className={`flex h-7 w-full items-center justify-center rounded-sm font-mono text-[10px] font-medium transition-colors ${c.bg}`}
      title={tooltip}
    >
      {cell.brand > 0 || cell.competitor > 0 ? (
        <span>
          {cell.brand}<span className="opacity-50">:</span>{cell.competitor}
        </span>
      ) : (
        <span className="opacity-50">{c.emoji}</span>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <LegendChip color="bg-emerald-200/70" label="✓ 守住 brand>0 comp=0" />
      <LegendChip color="bg-sky-200/70" label="⚔ 拉锯 都有" />
      <LegendChip color="bg-rose-200/70" label="✕ 失守 comp 独占" />
      <LegendChip color="bg-muted" label="· 真空" />
      <LegendChip color="bg-muted/40" label="无数据" />
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
