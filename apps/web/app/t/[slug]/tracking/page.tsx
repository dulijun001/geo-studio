import Link from 'next/link';
import { requireTenantMember } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RunButton } from './run-button';

export const dynamic = 'force-dynamic';

type QuestionRow = {
  id: string;
  text: string;
  intent: string;
  city: string | null;
  category: string | null;
  priority: number;
  active: boolean;
};

type LatestSnapshot = {
  question_id: string;
  status: string;
  asked_at: string | null;
  created_at: string;
  mention_count: number;
  own_count: number;
  comp_count: number;
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-800',
  running: 'bg-sky-100 text-sky-800',
  done: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  rate_limited: 'bg-amber-100 text-amber-800',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  running: '运行中',
  done: '完成',
  failed: '失败',
  rate_limited: '限流',
};

const INTENT_LABEL: Record<string, string> = {
  local_recommendation: '本地推荐',
  price_inquiry: '价格',
  procedure_info: '流程',
  doctor_review: '医生口碑',
  comparison: '对比',
  risk_concern: '风险',
  aftercare: '术后',
  other: '其他',
};

export default async function TrackingPage({ params }: { params: { slug: string } }) {
  const tenant = await requireTenantMember(params.slug);
  const supabase = createSupabaseServerClient();

  const { data: questionsRaw } = await supabase
    .from('questions')
    .select('id, text, intent, city, category, priority, active')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const questions = (questionsRaw ?? []) as QuestionRow[];

  // For each question, fetch the latest snapshot + counts. Two-step (no PG FKs
  // declared, PostgREST embeds return nothing — same pattern as publish/page).
  const latestByQuestion = new Map<string, LatestSnapshot>();
  if (questions.length > 0) {
    const { data: snapsRaw } = await supabase
      .from('geo_snapshots')
      .select('id, question_id, status, asked_at, created_at')
      .eq('tenant_id', tenant.id)
      .in('question_id', questions.map((q) => q.id))
      .order('created_at', { ascending: false })
      .limit(500);

    type SnapRow = {
      id: string;
      question_id: string;
      status: string;
      asked_at: string | null;
      created_at: string;
    };
    const snaps = (snapsRaw ?? []) as SnapRow[];

    // Most recent per question.
    const latestByQ = new Map<string, SnapRow>();
    for (const s of snaps) {
      if (!latestByQ.has(s.question_id)) latestByQ.set(s.question_id, s);
    }

    const latestIds = Array.from(latestByQ.values()).map((s) => s.id);
    const countsBySnap = new Map<string, { total: number; own: number; comp: number }>();
    if (latestIds.length > 0) {
      const { data: cits } = await supabase
        .from('citations')
        .select('snapshot_id, term_type')
        .in('snapshot_id', latestIds);
      type CitRow = { snapshot_id: string; term_type: string | null };
      for (const c of (cits ?? []) as CitRow[]) {
        const cur = countsBySnap.get(c.snapshot_id) ?? { total: 0, own: 0, comp: 0 };
        cur.total += 1;
        if (c.term_type === 'brand') cur.own += 1;
        if (c.term_type === 'competitor') cur.comp += 1;
        countsBySnap.set(c.snapshot_id, cur);
      }
    }

    for (const [qid, s] of latestByQ.entries()) {
      const c = countsBySnap.get(s.id) ?? { total: 0, own: 0, comp: 0 };
      latestByQuestion.set(qid, {
        question_id: qid,
        status: s.status,
        asked_at: s.asked_at,
        created_at: s.created_at,
        mention_count: c.total,
        own_count: c.own,
        comp_count: c.comp,
      });
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">GEO 追踪</h1>
        <p className="text-sm text-muted-foreground">
          模拟真人在豆包 Web 提问,品牌词典 NER 解析答复(ADR-002)。
          单次约 60-90s · V1 手动触发,V2 改为定时任务。
        </p>
      </header>

      {questions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          问题库还是空的。先跑 <code className="rounded bg-muted px-1">pnpm --filter @geo/db dev-seed-w6</code> 填一份种子问题库。
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">问题</th>
                <th className="px-4 py-2 font-medium">意图</th>
                <th className="px-4 py-2 font-medium">城市</th>
                <th className="px-4 py-2 font-medium">最新追踪</th>
                <th className="px-4 py-2 font-medium">本品牌 / 竞品</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {questions.map((q) => {
                const latest = latestByQuestion.get(q.id);
                return (
                  <tr key={q.id} className="hover:bg-muted/30">
                    <td className="max-w-[420px] px-4 py-2.5">
                      <div className="font-medium">{q.text}</div>
                      {q.category ? (
                        <div className="text-xs text-muted-foreground">{q.category}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {INTENT_LABEL[q.intent] ?? q.intent}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{q.city ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {latest ? (
                        <SnapshotBadge latest={latest} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {latest && latest.status === 'done' ? (
                        <span>
                          <span className="font-medium text-emerald-700">{latest.own_count}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="font-medium text-rose-700">{latest.comp_count}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <RunButton tenantSlug={tenant.slug} questionId={q.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        更详细的覆盖率 / SOV 曲线 / 未命中诊断在 W6.3 报表里
        {' · '}
        <Link
          href="/t/demo-dental"
          className="underline-offset-2 hover:underline"
        >
          回概览
        </Link>
      </p>
    </div>
  );
}

function SnapshotBadge({ latest }: { latest: LatestSnapshot }) {
  const cls = STATUS_BADGE[latest.status] ?? 'bg-muted';
  const label = STATUS_LABEL[latest.status] ?? latest.status;
  const ts = latest.asked_at ?? latest.created_at;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground">
        {new Date(ts).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
}
