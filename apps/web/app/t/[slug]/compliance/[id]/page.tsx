import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';
import { ReviewActions } from './review-actions';
import { HighlightedBody } from './highlighted-body';
import { EditForm } from './edit-form';

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
      'id, title, body, platform, status, compliance_status, compliance_review_id, created_at, content_item_id',
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
          <span>提交于 {new Date(variant.created_at).toLocaleString('zh-CN')}</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),380px]">
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">正文(命中红黄高亮)</h2>
          <div className="rounded-md border border-border bg-background p-5 text-sm leading-relaxed">
            <HighlightedBody body={variant.body} findings={findings} />
          </div>
          {findings.length === 0 && (
            <p className="text-xs text-muted-foreground">关键词扫描未命中任何词。</p>
          )}
        </section>

        <aside className="space-y-5">
          <ReviewTimeline reviews={reviewRows} reviewerEmails={reviewerEmails} />
          {canAct ? (
            <ReviewActions tenantSlug={tenant.slug} variantId={variant.id} />
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              变体已处于终态({variant.compliance_status}),不再接受审批动作。
            </div>
          )}
          <EditForm
            tenantSlug={tenant.slug}
            variantId={variant.id}
            initialTitle={variant.title}
            initialBody={variant.body}
            disabled={editLocked}
            disabledReason="变体已派发给员工,改文案会让员工手里版本不一致。先撤回派单或废弃变体重新生成。"
          />
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
              {new Date(r.created_at).toLocaleString('zh-CN')}
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
