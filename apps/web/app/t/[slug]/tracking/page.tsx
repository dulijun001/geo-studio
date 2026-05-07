import Link from 'next/link';
import { requireTenantMember } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { SovDonut } from '@/components/sov-donut';
import { fmtDateShort } from '@/lib/format';
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
  snapshot_id: string;
  status: string;
  asked_at: string | null;
  created_at: string;
  session_url: string | null;
  mention_count: number;
  own_count: number;
  comp_count: number;
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-white/[0.06] text-foreground',
  running: 'bg-sky-500/[0.10] text-sky-300 border border-sky-500/30',
  done: 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30',
  failed: 'bg-rose-500/[0.10] text-rose-300 border border-rose-500/30',
  rate_limited: 'bg-amber-500/[0.10] text-amber-300 border border-amber-500/30',
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
      .select('id, question_id, status, asked_at, created_at, session_url')
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
      session_url: string | null;
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
        snapshot_id: s.id,
        status: s.status,
        asked_at: s.asked_at,
        created_at: s.created_at,
        session_url: s.session_url,
        mention_count: c.total,
        own_count: c.own,
        comp_count: c.comp,
      });
    }
  }

  let totalOwn = 0;
  let totalComp = 0;
  let questionsWithData = 0;
  for (const latest of latestByQuestion.values()) {
    if (latest.status !== 'done') continue;
    totalOwn += latest.own_count;
    totalComp += latest.comp_count;
    questionsWithData += 1;
  }

  // 抓最近 30 条 snapshot 看豆包追踪健康度。
  // 关键信号:连续 failure_reason 含 "login required" → cookie 失效,提醒重登录。
  const { data: recentSnapsRaw } = await supabase
    .from('geo_snapshots')
    .select('status, failure_reason, asked_at, created_at')
    .eq('tenant_id', tenant.id)
    .eq('engine', 'doubao')
    .order('created_at', { ascending: false })
    .limit(30);
  type SnapHealth = { status: string; failure_reason: string | null; asked_at: string | null; created_at: string };
  const recentSnaps = (recentSnapsRaw ?? []) as SnapHealth[];
  const trackerHealth = computeHealth(recentSnaps);

  return (
    <div className="space-y-6">
      <PageHeader
        title="GEO 追踪"
        subtitle="模拟真人在豆包 Web 提问,品牌词典 NER 解析答复(ADR-002)· 单次约 60-90s,V1 手动触发"
      />

      <TrackerHealthBanner health={trackerHealth} />

      <InlineGuide
        storageKey={`guide:tracking:${tenant.slug}`}
        title="GEO 是什么、追踪什么"
        body="豆包/元宝/ChatGPT 这类 AI 助手已经替代了搜索引擎的一部分。患者问「南京种植牙推荐哪家」,答案里出现的是省口腔、市口腔还是你?这页就是把这些问题定期跑给 AI,看你是被提到的、还是不在场的。"
        steps={[
          '左侧问题列表是种子库(20 条),点「跑这条」会启动 Playwright 在头部 Chrome 里模拟真人问豆包',
          '答复回来后,品牌词典(在 brand_vocab 表)做关键词命中,本品牌 / 竞品 / 医生名分类',
          '同 IP 高频请求会被豆包静默限流,V1 半自动可接受,V2 加代理池解开',
        ]}
        linkLabel="为什么不直接调豆包 API"
        linkHref={`/t/${tenant.slug}/help#tracking`}
      />

      {questionsWithData > 0 ? (
        <section className="card-surface p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-foreground">本品牌话语权(SOV)</h2>
            <p className="text-xs text-muted-foreground">
              基于 {questionsWithData} 条已抓回的问题
            </p>
          </div>
          <SovDonut ownCount={totalOwn} competitorCount={totalComp} />
        </section>
      ) : null}

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
                          <span className="font-medium text-emerald-400">{latest.own_count}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="font-medium text-rose-300">{latest.comp_count}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <RunButton tenantSlug={tenant.slug} questionId={q.id} />
                        {latest?.session_url ? (
                          <a
                            href={latest.session_url}
                            target="_blank"
                            rel="noreferrer"
                            title={`打开豆包原始对话 — ${latest.session_url}`}
                            className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            豆包 ↗
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        提示:同 IP 短时高频跑同一问题会被豆包静默限流,SOV 趋势看起来异常时先静一会儿再试。
      </p>
    </div>
  );
}

type TrackerHealth = {
  level: 'healthy' | 'degraded' | 'login_required' | 'no_data';
  successRate: number;
  total: number;
  loginFailures: number;
  lastSuccessAt: string | null;
};

function computeHealth(
  snaps: Array<{ status: string; failure_reason: string | null; asked_at: string | null; created_at: string }>,
): TrackerHealth {
  if (snaps.length === 0) {
    return { level: 'no_data', successRate: 0, total: 0, loginFailures: 0, lastSuccessAt: null };
  }
  const total = snaps.length;
  const ok = snaps.filter((s) => s.status === 'done').length;
  const successRate = total > 0 ? Math.round((ok / total) * 100) : 0;
  const loginFailures = snaps.filter(
    (s) => s.status === 'failed' && /login required|chat URL never advanced/i.test(s.failure_reason ?? ''),
  ).length;
  const lastSuccess = snaps.find((s) => s.status === 'done');
  const lastSuccessAt = lastSuccess?.asked_at ?? lastSuccess?.created_at ?? null;
  // Recent 5 snapshots all login-required = cookie expired
  const recent5 = snaps.slice(0, 5);
  const recent5LoginFails = recent5.filter(
    (s) => s.status === 'failed' && /login required/i.test(s.failure_reason ?? ''),
  ).length;
  if (recent5.length >= 3 && recent5LoginFails === recent5.length) {
    return { level: 'login_required', successRate, total, loginFailures, lastSuccessAt };
  }
  if (successRate >= 80) {
    return { level: 'healthy', successRate, total, loginFailures, lastSuccessAt };
  }
  return { level: 'degraded', successRate, total, loginFailures, lastSuccessAt };
}

function TrackerHealthBanner({ health }: { health: TrackerHealth }) {
  if (health.level === 'no_data') return null;
  if (health.level === 'healthy') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.10] px-4 py-2 text-sm text-emerald-200">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-medium">豆包追踪健康</span>
        <span className="text-xs text-emerald-300/70">
          最近 {health.total} 次成功率 {health.successRate}%
          {health.lastSuccessAt && ` · 最后成功 ${fmtDateShort(health.lastSuccessAt)}`}
        </span>
      </div>
    );
  }
  if (health.level === 'login_required') {
    return (
      <div className="space-y-2 rounded-md border border-rose-500/30 bg-rose-500/[0.10] p-4 text-sm text-rose-200">
        <div className="flex items-center gap-2 font-medium">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
          豆包登录态过期,追踪已全部失败
        </div>
        <p className="text-xs text-rose-200/80">
          最近 5 次 snapshot 都失败在「login required」。豆包要求登录用户才能提问,
          cookie 失效需重新登录(通常 30-90 天一次)。
        </p>
        <div className="rounded-sm bg-rose-500/[0.10] px-3 py-2 font-mono text-[11px] text-rose-200">
          # 在你 Mac 终端跑这个命令(打开 Chrome 让你扫码登录){'\n'}
          cd apps/worker && pnpm doubao:login
        </div>
      </div>
    );
  }
  // degraded
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.10] px-4 py-2 text-sm text-amber-200">
      <span className="mt-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
      <div className="space-y-0.5">
        <div className="font-medium">追踪部分失败</div>
        <div className="text-xs text-amber-200/80">
          最近 {health.total} 次成功率 {health.successRate}%(健康阈值 80%)。
          {health.loginFailures > 0 && ` 其中 ${health.loginFailures} 次因登录态过期失败,可能要重新跑 pnpm doubao:login。`}
        </div>
      </div>
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
      <span className="text-xs text-muted-foreground">{fmtDateShort(ts)}</span>
    </div>
  );
}
