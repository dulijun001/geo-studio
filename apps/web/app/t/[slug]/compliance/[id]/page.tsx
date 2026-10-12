import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';
import { fmtDateTime } from '@/lib/format';
import { EeatCard } from '@/components/eeat-card';
import { lookupNeedlesInKb, type NeedleVerdict } from '@/lib/kb-needle-lookup';
import { ReviewActions } from './review-actions';
import { EditForm } from './edit-form';
import { InlineEditBody } from './inline-edit-body';
import { AiRewriteButton, InlineAiRewriteCta } from './ai-rewrite-button';
import { CitationRewriteButton } from './citation-rewrite-button';
import { OverrideRejectionButton } from './override-rejection-button';

export const dynamic = 'force-dynamic';

type Finding = {
  keyword_id: string;
  term: string;
  level: 'A' | 'B';
  category: string;
  matched_span: string;
  offset: number;
  context_snippet: string;
};

type ReviewRow = {
  id: string;
  stage: 'keyword' | 'llm' | 'manual';
  verdict: 'pass' | 'warn' | 'reject';
  risk_level: 'low' | 'medium' | 'high';
  findings: Finding[] | null;
  rationale: string | null;
  reviewer_id: string | null;
  created_at: string;
};

export default async function ComplianceDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'auditor']);
  const supabase = createSupabaseServerClient();

  const { data: variant } = await supabase
    .from('content_variants')
    .select(
      'id, title, body, platform, status, compliance_status, compliance_review_id, created_at, content_item_id, geo_score, citation_check, case_match, numeric_check, extra_assets',
    )
    .eq('id', params.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!variant) notFound();

  const { data: reviews } = await supabase
    .from('compliance_reviews')
    .select('id, stage, verdict, risk_level, findings, rationale, reviewer_id, created_at')
    .eq('target_id', variant.id)
    .eq('target_type', 'content_variant')
    .order('created_at', { ascending: true });
  const reviewRows = (reviews ?? []) as ReviewRow[];

  // Hydrate reviewer email for manual reviews. service client because auth.users
  // is not reachable via anon-key.
  const service = getSupabaseServiceClient();
  const reviewerEmails = new Map<string, string>();
  const reviewerIds = Array.from(
    new Set(reviewRows.map((r) => r.reviewer_id).filter((id): id is string => !!id)),
  );
  await Promise.all(
    reviewerIds.map(async (id) => {
      const { data: u } = await service.auth.admin.getUserById(id);
      if (u?.user?.email) reviewerEmails.set(id, u.user.email);
    }),
  );

  // Source findings come from the most recent keyword-stage review — this is what
  // we highlight in the body. LLM stage may add its own span-level findings later.
  const keywordReview = [...reviewRows].reverse().find((r) => r.stage === 'keyword');
  const findings: Finding[] = keywordReview?.findings ?? [];

  const isTerminal =
    variant.compliance_status === 'manual_approved' || variant.compliance_status === 'rejected';
  const canAct = !isTerminal;
  const editLocked = ['dispatched', 'published'].includes(variant.status);

  // Resolve "is this needle in KB or true hallucination" for the
  // suspected_hallucination panel.
  const cc = variant.citation_check as
    | { verdict?: string; unmatched?: Array<{ needle: string }> }
    | null;
  const unmatchedNeedles =
    cc?.verdict === 'suspected_hallucination' && Array.isArray(cc.unmatched)
      ? cc.unmatched.map((u) => u.needle).filter(Boolean)
      : [];
  const needleVerdicts = unmatchedNeedles.length
    ? await lookupNeedlesInKb(unmatchedNeedles, tenant.id)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/t/${tenant.slug}/compliance`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← 返回合规队列
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{variant.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="uppercase tracking-wider">{variant.platform.replace(/_/g, ' ')}</span>
          <span>·</span>
          <span>合规:{variant.compliance_status}</span>
          <span>·</span>
          <span>变体:{variant.status}</span>
          <span>·</span>
          <span>提交于 {fmtDateTime(variant.created_at)}</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),380px]">
        <InlineEditBody
          tenantSlug={tenant.slug}
          variantId={variant.id}
          initialTitle={variant.title}
          initialBody={variant.body}
          findings={findings}
          disabled={editLocked}
          disabledReason="变体已派发给员工,改文案会让员工手里版本不一致。先撤回派单或废弃变体。"
        />

        <aside className="space-y-5">
          <CaseMatchPanel match={variant.case_match} />
          <GeoScorePanel
            score={variant.geo_score}
            tenantSlug={tenant.slug}
            variantId={variant.id}
          />
          {variant.geo_score && typeof variant.geo_score.total === 'number' ? (
            <EeatCard score={variant.geo_score as unknown as import('@geo/geo-core').GeoScore} compact />
          ) : null}
          <CitationCheckPanel
            check={variant.citation_check}
            kbVerdicts={needleVerdicts}
            tenantSlug={tenant.slug}
            variantId={variant.id}
            canRewrite={!editLocked}
          />
          <NumericCheckPanel check={variant.numeric_check} />
          <DiffLabelPanel extraAssets={variant.extra_assets} />
          <ReviewTimeline reviews={reviewRows} reviewerEmails={reviewerEmails} />
          {canAct ? (
            <ReviewActions
              tenantSlug={tenant.slug}
              variantId={variant.id}
              citationCheck={variant.citation_check as { verdict?: string; unmatched?: Array<{ needle: string }> } | null}
            />
          ) : variant.compliance_status === 'rejected' ? (
            <div className="space-y-2">
              <AiRewriteButton tenantSlug={tenant.slug} variantId={variant.id} />
              <OverrideRejectionButton tenantSlug={tenant.slug} variantId={variant.id} />
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              变体已处于终态({variant.compliance_status}),不再接受审批动作。
            </div>
          )}
          <div id="variant-edit-form" className="scroll-mt-6">
            <EditForm
              tenantSlug={tenant.slug}
              variantId={variant.id}
              initialTitle={variant.title}
              initialBody={variant.body}
              disabled={editLocked}
              disabledReason="变体已派发给员工,改文案会让员工手里版本不一致。先撤回派单或废弃变体重新生成。"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReviewTimeline({
  reviews,
  reviewerEmails,
}: {
  reviews: ReviewRow[];
  reviewerEmails: Map<string, string>;
}) {
  if (reviews.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        尚未进入审查流程。
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">审查时间线</h2>
      <ol className="space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-md border border-border bg-background p-3 text-xs">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-medium">{stageLabel(r.stage)}</span>
              <VerdictChip verdict={r.verdict} risk={r.risk_level} />
            </div>
            {r.rationale && <p className="text-muted-foreground">{r.rationale}</p>}
            {(r.findings?.length ?? 0) > 0 && (
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {(r.findings ?? []).slice(0, 5).map((f, idx) => (
                  <li key={`${r.id}-${idx}`} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 rounded-sm px-1 text-[10px] font-medium ${
                        f.level === 'A' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {f.level}
                    </span>
                    <span>
                      <span className="font-medium">{f.term}</span>
                      <span className="mx-1 text-muted-foreground/70">·</span>
                      <span>{f.category}</span>
                    </span>
                  </li>
                ))}
                {(r.findings?.length ?? 0) > 5 && (
                  <li className="text-muted-foreground/70">
                    还有 {(r.findings?.length ?? 0) - 5} 条…
                  </li>
                )}
              </ul>
            )}
            <p className="mt-2 text-muted-foreground/70">
              {fmtDateTime(r.created_at)}
              {r.stage === 'manual' && r.reviewer_id ? (
                <span className="ml-2">
                  · 由 {reviewerEmails.get(r.reviewer_id) ?? r.reviewer_id.slice(0, 8)}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function stageLabel(stage: string): string {
  return {
    keyword: '第一道 · 关键词扫描',
    llm: '第二道 · LLM 语义审查',
    manual: '第三道 · 人工审批',
  }[stage] ?? stage;
}

function VerdictChip({ verdict, risk }: { verdict: string; risk: string }) {
  const style: Record<string, string> = {
    pass: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
    reject: 'bg-rose-100 text-rose-800',
  };
  const label: Record<string, string> = { pass: '通过', warn: '警告', reject: '拒绝' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style[verdict] ?? 'bg-muted'}`}>
      {label[verdict] ?? verdict} · {risk}
    </span>
  );
}

// ─── GEO 9 法评分面板 ───────────────────────────────────────────────────
type GeoScore = {
  total: number;
  version: number;
  scored_at: string;
  rewrite_count?: number;
  breakdown: Record<string, { score: number; max: number; evidence?: string[]; note?: string }>;
};

const TACTIC_LABEL_ZH: Record<string, string> = {
  statistics: '数据统计',
  quotation: '权威引语',
  citation: '引用来源',
  fluency: '流畅度',
  readability: '易理解',
  keyword_freq: '关键词密度',
  position: '关键词位置',
  unique: '独特表达',
  authority: '权威语调',
};

function GeoScorePanel({
  score,
  tenantSlug,
  variantId,
}: {
  score: GeoScore | null | undefined;
  tenantSlug: string;
  variantId: string;
}) {
  if (!score || typeof score.total !== 'number') {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">GEO 9 法评分</p>
        <p className="mt-1">这条变体未评分(可能是迁移前生成的旧数据)。</p>
      </div>
    );
  }
  const total = score.total;
  const tone =
    total >= 80 ? 'emerald' : total >= 70 ? 'sky' : total >= 60 ? 'amber' : 'rose';
  const toneClass = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
  }[tone];

  // Compute the top-3 weakest tactics inline (mirrors getWeakestTactics
  // logic so we don't need to ship the geo-core helper to this server file).
  const weakest = Object.entries(score.breakdown ?? {})
    .map(([id, t]) => ({ id, ratio: t.max > 0 ? t.score / t.max : 1, score: t.score, max: t.max }))
    .filter((x) => x.ratio < 1)
    .sort((a, b) => b.max - b.score - (a.max - a.score))
    .slice(0, 3);

  return (
    <div className={`rounded-md border p-3 text-xs ${toneClass}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-medium">GEO 9 法评分</span>
        <span className="text-2xl font-semibold leading-none">{total}<span className="text-xs font-normal opacity-60">/100</span></span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {Object.entries(score.breakdown ?? {}).map(([key, t]) => {
          const pct = t.max > 0 ? Math.round((t.score / t.max) * 100) : 0;
          const dot = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';
          return (
            <li key={key} className="flex items-center gap-1.5">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
              <span className="flex-1 truncate">{TACTIC_LABEL_ZH[key] ?? key}</span>
              <span className="font-mono opacity-70">{t.score}/{t.max}</span>
            </li>
          );
        })}
      </ul>
      {total < 70 && weakest.length > 0 && (
        <WeakestTacticsPrompt
          tenantSlug={tenantSlug}
          variantId={variantId}
          weakest={weakest}
          tone={tone}
        />
      )}
    </div>
  );
}

const TACTIC_ADVICE_ZH: Record<string, string> = {
  statistics: '加入更多具体数字(年限、百分比、价格区间、样本量等),不要泛泛而谈',
  quotation: '加入 1-2 处「直接引语」(医生原话、文献金句),用 「...」 包裹',
  citation: '加入至少 1 条具名权威来源(《XX 指南》/中华医学会/国家卫健委)',
  fluency: '增加段落数(至少 3 段),让句子长短交替,不要一直长句或一直短句',
  readability: '把超过 35 字的长句拆成 2-3 句,每段控制在 80 字内',
  keyword_freq: '主题关键词在正文里至少出现 2-5 次,不要只在标题',
  position: '把主题关键词放进开头 100 字以内,首句最好就出现',
  unique: '避开「众所周知」「随着...的发展」「为大家详细介绍」这种模板套话',
  authority: '使用 "临床数据显示"/"医生建议"/"研究表明" 这类权威短语,避免主观夸张',
};

function WeakestTacticsPrompt({
  tenantSlug,
  variantId,
  weakest,
  tone,
}: {
  tenantSlug: string;
  variantId: string;
  weakest: Array<{ id: string; score: number; max: number }>;
  tone: 'emerald' | 'sky' | 'amber' | 'rose';
}) {
  const accentBtn =
    tone === 'rose'
      ? 'bg-rose-700 text-white hover:bg-rose-800 border-rose-800'
      : tone === 'amber'
        ? 'bg-amber-700 text-white hover:bg-amber-800 border-amber-800'
        : 'bg-foreground text-background hover:bg-foreground/90 border-foreground';

  return (
    <div className="mt-3 space-y-2.5 rounded-md bg-white/60 p-3 text-foreground">
      <p className="text-[11px] font-medium opacity-80">
        ⚠️ 低于 70 分阈值。下面这 {weakest.length} 项最弱,优先补这几个:
      </p>
      <ul className="space-y-2">
        {weakest.map((w) => (
          <li key={w.id} className="space-y-0.5">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{TACTIC_LABEL_ZH[w.id] ?? w.id}</span>
              <span className="font-mono text-[10px] opacity-60">
                {w.score} / {w.max}
              </span>
            </div>
            <p className="pl-3 text-[11px] leading-relaxed text-muted-foreground">
              → {TACTIC_ADVICE_ZH[w.id] ?? '提升此维度'}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <InlineAiRewriteCta
          tenantSlug={tenantSlug}
          variantId={variantId}
          mode="geo_score"
          className={accentBtn}
        />
        <a
          href="#variant-edit-form"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
        >
          自己编辑 ↓
        </a>
      </div>
    </div>
  );
}

// ─── Citation hallucination check 面板 ─────────────────────────────────
type CitationCheck = {
  scanned_at: string;
  whitelist_size: number;
  matches: Array<{ needle: string; verified_id: string; matched_form: string }>;
  unmatched: Array<{ needle: string; context_snippet: string }>;
  verdict: 'ok' | 'suspected_hallucination' | 'whitelist_empty';
};

// ─── 历史合规案例比对面板 ────────────────────────────────────────────
type CaseMatch = {
  scanned_at: string;
  cases_evaluated: number;
  matches: Array<{
    case_id: string;
    title: string;
    category: string;
    jurisdiction: string | null;
    fine_yuan: number | null;
    case_url: string | null;
    similarity: number;
    matched_patterns: string[];
    total_patterns: number;
  }>;
};

function CaseMatchPanel({ match }: { match: CaseMatch | null | undefined }) {
  if (!match) return null;
  if (match.matches.length === 0) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
        <p className="font-medium">历史案例比对 ✓</p>
        <p className="mt-1">扫描了 {match.cases_evaluated} 条公开处罚案例,本文与所有案例都 ≤ 50% 重合。</p>
      </div>
    );
  }
  const top = match.matches[0]!;
  const totalFineYuan = match.matches.reduce((sum, m) => sum + (m.fine_yuan ?? 0), 0);
  return (
    <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <p className="font-medium">⚠️ 历史案例比对 — {match.matches.length} 个相似案例</p>
      <p className="mt-1 opacity-90">
        本文跟历史处罚案例有 ≥ 50% 违规要素重合。<strong className="font-semibold">这不是直接判违规</strong>,但建议参考案例做调整 — 如果发布后被举报或被监管比对,容易被判定相似行为。
      </p>
      {totalFineYuan > 0 && (
        <p className="mt-1 text-[11px] opacity-80">
          相关案例累计罚款金额:¥{(totalFineYuan / 10000).toFixed(1)} 万
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {match.matches.slice(0, 3).map((m) => (
          <li key={m.case_id} className="rounded-sm bg-amber-100/70 p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{m.title}</span>
              <span className="shrink-0 font-mono text-[10px] opacity-70">
                {Math.round(m.similarity * 100)}% 重合
              </span>
            </div>
            <div className="mt-0.5 text-[11px] opacity-80">
              {m.category}
              {m.jurisdiction && ` · ${m.jurisdiction}`}
              {m.fine_yuan && ` · 罚 ¥${(m.fine_yuan / 10000).toFixed(0)} 万`}
            </div>
            <div className="mt-1 text-[10px] opacity-75">
              命中要素: {m.matched_patterns.join('、')}
            </div>
          </li>
        ))}
        {match.matches.length > 3 && (
          <li className="text-[11px] opacity-70">…还有 {match.matches.length - 3} 条相似案例</li>
        )}
      </ul>
    </div>
  );
}

function CitationCheckPanel({
  check,
  kbVerdicts,
  tenantSlug,
  variantId,
  canRewrite,
}: {
  check: CitationCheck | null | undefined;
  kbVerdicts: NeedleVerdict[];
  tenantSlug: string;
  variantId: string;
  canRewrite: boolean;
}) {
  const verdictByNeedle = new Map(kbVerdicts.map((v) => [v.needle, v]));
  if (!check) return null;
  if (check.verdict === 'whitelist_empty') {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">引用核实</p>
        <p className="mt-1">租户没有维护可引用文献白名单(请在设置 → 引用来源添加),无法做幻觉检查。</p>
      </div>
    );
  }
  if (check.verdict === 'ok') {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
        <p className="font-medium">引用核实 ✓</p>
        <p className="mt-1">
          全部 {check.matches.length} 条引用都来自白名单(共 {check.whitelist_size} 条可引用文献)。
        </p>
        {check.matches.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[11px] opacity-90">
            {check.matches.slice(0, 4).map((m, i) => (
              <li key={i}>• {m.needle} → 匹配「{m.matched_form}」</li>
            ))}
            {check.matches.length > 4 && <li>… 还有 {check.matches.length - 4} 条</li>}
          </ul>
        )}
      </div>
    );
  }
  // suspected_hallucination
  return (
    <div className="rounded-md border-2 border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
      <p className="font-medium">⚠️ 引用核实 — {check.unmatched.length} 条白名单未匹配</p>
      <p className="mt-1 opacity-90">
        以下引用在 verified_citations 白名单({check.whitelist_size} 条)里<strong className="font-semibold">找不到</strong>。
        每条已自动溯源:🟢 = KB 里有(运营核实后可加入白名单),🔴 = KB 里也没有(LLM 真编)。
      </p>
      <ul className="mt-2 space-y-2">
        {check.unmatched.map((u, i) => {
          const v = verdictByNeedle.get(u.needle);
          const inKb = v?.in_kb ?? false;
          return (
            <li
              key={i}
              className={`rounded-sm p-2 ${inKb ? 'bg-amber-100/70 border border-amber-300' : 'bg-rose-100/70 border border-rose-300'}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-base leading-none">{inKb ? '🟢' : '🔴'}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-medium">{u.needle}</div>
                  <div className="mt-0.5 text-[11px] opacity-80">…{u.context_snippet}…</div>
                  {inKb && v ? (
                    <div className="mt-1.5 rounded border border-amber-300 bg-white/60 px-2 py-1.5">
                      <div className="text-[11px] font-medium text-amber-800">
                        ⓘ KB 里找到这段话(共 {v.hits.length} 处),AI 是<strong>忠实引用</strong>。说明 KB 内容本身需要审核:
                      </div>
                      <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-amber-900">
                        {v.hits.map((h, j) => (
                          <li key={j} className="truncate">
                            <span className="opacity-60">{h.source_path}</span>
                            <span className="opacity-50">:{h.line}</span>
                            <div className="ml-2 break-all opacity-70 font-sans">
                              "{h.context}"
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-1 text-[10px] text-amber-700">
                        建议:① 真实 → 把这条加入 verified_citations 白名单 ② 营销话术 → 让运营改 KB 这段话
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[11px] text-rose-700">
                      KB 里也没有这段话 — 是 LLM 真编造,建议 reject 让 worker 重写。
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {check.matches.length > 0 && (
        <p className="mt-2 text-[11px] opacity-70">
          (另有 {check.matches.length} 条引用核实通过)
        </p>
      )}
      {canRewrite ? (
        <CitationRewriteButton tenantSlug={tenantSlug} variantId={variantId} />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 档位 C1 — Numeric fact-check display
// ─────────────────────────────────────────────────────────────────────────
type NumericClaim = {
  citation: string;
  number: string;
  sentence: string;
  verdict: 'pass' | 'suspect' | 'reject';
  reason: string;
  mode: 'heuristic_reject' | 'llm_judged' | 'no_ground_truth';
};
type NumericCheck = {
  scanned_at: string;
  verdict: 'pass' | 'suspect' | 'reject';
  claims: NumericClaim[];
  llm_used: boolean;
} | null;

function NumericCheckPanel({ check }: { check: NumericCheck }) {
  if (!check) return null;
  // Don't show a panel for clean pass + no claims — it's noise.
  if (check.verdict === 'pass' && check.claims.every((c) => c.mode === 'no_ground_truth')) {
    if (check.claims.length === 0) return null;
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">数据事实核查</p>
        <p className="mt-1">
          找到 {check.claims.length} 条「引用 + 数字」组合,但白名单源未配置 key_claims,无法机器核验。建议运营人员在引用源里补充关键陈述以启用 LLM 裁判。
        </p>
      </div>
    );
  }
  const reject = check.claims.filter((c) => c.verdict === 'reject');
  const suspect = check.claims.filter((c) => c.verdict === 'suspect');
  const tone =
    check.verdict === 'reject'
      ? 'border-2 border-rose-300 bg-rose-50 text-rose-900'
      : check.verdict === 'suspect'
        ? 'border border-amber-300 bg-amber-50 text-amber-900'
        : 'border border-emerald-200 bg-emerald-50 text-emerald-900';
  const icon = check.verdict === 'reject' ? '⛔' : check.verdict === 'suspect' ? '⚠️' : '✓';
  return (
    <div className={`rounded-md p-3 text-xs ${tone}`}>
      <p className="font-medium">
        {icon} 数据事实核查 {check.llm_used ? '(LLM 已裁判)' : '(启发式)'}
      </p>
      {reject.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-medium">{reject.length} 条疑似数据幻觉(已强制人工审):</p>
          <ul className="mt-1 space-y-1.5">
            {reject.slice(0, 4).map((c, i) => (
              <li key={i} className="rounded-sm bg-rose-100/60 p-1.5">
                <div className="font-mono">
                  {c.citation} · {c.number}
                </div>
                <div className="mt-0.5 text-[11px] opacity-80">{c.sentence}</div>
                <div className="mt-0.5 text-[10px] opacity-70">理由:{c.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {suspect.length > 0 && check.verdict !== 'reject' && (
        <p className="mt-2 text-[11px] opacity-90">
          {suspect.length} 条不确定(LLM 无法判断与 ground truth 是否一致),建议人工复核。
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 档位 C3 — Cross-platform diff label badge
// ─────────────────────────────────────────────────────────────────────────
function DiffLabelPanel({ extraAssets }: { extraAssets: Record<string, unknown> | null }) {
  const label = extraAssets?.diff_label;
  if (typeof label !== 'string' || label.length === 0) return null;
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
      <p className="font-medium">该平台版本特征</p>
      <p className="mt-1 italic">「{label}」</p>
      <p className="mt-1 text-[11px] opacity-70">
        与本次生成中最相似的兄弟版本对比,自动生成的差异化标签
      </p>
    </div>
  );
}
