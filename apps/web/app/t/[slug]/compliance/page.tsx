import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/tenant';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { fmtDateTime } from '@/lib/format';
import { BulkActions, BulkCheckbox } from './bulk-actions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  title: string;
  platform: string;
  status: string;
  compliance_status: string;
  compliance_review_id: string | null;
  created_at: string;
  citation_check: { verdict?: string; unmatched?: Array<unknown> } | null;
  numeric_check: { verdict?: string } | null;
  case_match: { matches?: Array<unknown> } | null;
  geo_score: { total?: number } | null;
};

const TABS = [
  { key: 'pending', label: '待人工审批', filter: 'pending' },
  { key: 'rejected', label: '已拒绝', filter: 'rejected' },
  { key: 'approved', label: '已通过', filter: 'approved' },
] as const;

export default async function CompliancePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'auditor']);
  const supabase = createSupabaseServerClient();

  const activeTab = TABS.find((t) => t.key === searchParams.tab) ?? TABS[0];

  const statusFilter: string[] =
    activeTab.filter === 'pending'
      ? ['pending']
      : activeTab.filter === 'rejected'
        ? ['rejected']
        : ['auto_approved', 'manual_approved'];

  const { data: items } = await supabase
    .from('content_variants')
    .select(
      'id, title, platform, status, compliance_status, compliance_review_id, created_at, citation_check, numeric_check, case_match, geo_score',
    )
    .eq('tenant_id', tenant.id)
    .in('compliance_status', statusFilter)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (items ?? []) as Row[];

  const counts = await Promise.all(
    TABS.map(async (t) => {
      const filter =
        t.filter === 'pending'
          ? ['pending']
          : t.filter === 'rejected'
            ? ['rejected']
            : ['auto_approved', 'manual_approved'];
      const { count } = await supabase
        .from('content_variants')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .in('compliance_status', filter);
      return count ?? 0;
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="合规审核"
        subtitle="三道门:关键词黑名单(自动)→ 豆包语义审查(自动)→ 管理员人工复核"
      />

      <InlineGuide
        storageKey={`guide:compliance:${tenant.slug}`}
        title="为什么医疗行业需要三道门"
        body="《医疗广告法》对绝对化用语 / 治愈承诺 / 患者照片 / 专家排名等都有明确禁用,违规处罚十万起步。我们用 A 级关键词(无法挽救,直接拒)+ B 级关键词(有可能违规,触发 LLM 评估)+ 人工兜底,把假阳性和假阴性都压到最低。"
        linkLabel="A/B 级词库管理"
        linkHref={`/t/${tenant.slug}/help#compliance`}
      />

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t, i) => {
          const active = t.key === activeTab.key;
          return (
            <Link
              key={t.key}
              href={`?tab=${t.key}`}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors ${
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                }`}
              >
                {counts[i]}
              </span>
            </Link>
          );
        })}
      </div>

      {activeTab.key === 'pending' && rows.length > 0 ? (
        <BulkActions tenantSlug={tenant.slug} />
      ) : null}

      {rows.length > 0 ? (
        <ReviewTable
          rows={rows}
          tenantSlug={tenant.slug}
          showCheckbox={activeTab.key === 'pending'}
        />
      ) : (
        <EmptyState activeTab={activeTab.key} />
      )}
    </div>
  );
}

function ReviewTable({
  rows,
  tenantSlug,
  showCheckbox,
}: {
  rows: Row[];
  tenantSlug: string;
  showCheckbox: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="bg-white/[0.02] text-left text-[10.5px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            {showCheckbox ? <th className="w-10 px-4 py-2" /> : null}
            <th className="px-4 py-2 font-medium">变体标题</th>
            <th className="px-4 py-2 font-medium">平台</th>
            <th className="px-4 py-2 font-medium">拦截原因</th>
            <th className="px-4 py-2 font-medium">合规状态</th>
            <th className="px-4 py-2 font-medium">提交时间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="transition hover:bg-white/[0.02]">
              {showCheckbox ? (
                <td className="px-4 py-2.5">
                  <BulkCheckbox variantId={r.id} />
                </td>
              ) : null}
              <td className="px-4 py-2.5">
                <Link
                  href={`/t/${tenantSlug}/compliance/${r.id}`}
                  className="font-medium transition hover:text-emerald-400 hover:underline underline-offset-2"
                >
                  {r.title}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                {r.platform.replace(/_/g, ' ')}
              </td>
              <td className="px-4 py-2.5">
                <InterceptReasonBadges row={r} />
              </td>
              <td className="px-4 py-2.5">
                <ComplianceBadge status={r.compliance_status} />
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {fmtDateTime(r.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * CMP-2 — quick visual on which gate(s) flagged this variant. Helps the
 * auditor scan a 100-row queue without clicking into every detail page.
 * Shows up to 4 badge types: GEO score < 70, citation hallucination, numeric
 * fact-check reject, historical case match.
 */
function InterceptReasonBadges({ row }: { row: Row }) {
  const badges: Array<{ label: string; tone: 'rose' | 'amber' | 'sky' }> = [];

  const geoTotal = row.geo_score?.total;
  if (typeof geoTotal === 'number' && geoTotal < 70) {
    badges.push({ label: `GEO ${geoTotal}/100`, tone: 'amber' });
  }
  if (row.citation_check?.verdict === 'suspected_hallucination') {
    const n = row.citation_check.unmatched?.length ?? 0;
    badges.push({ label: `引用幻觉 ×${n}`, tone: 'rose' });
  }
  if (row.numeric_check?.verdict === 'reject') {
    badges.push({ label: '数字幻觉', tone: 'rose' });
  } else if (row.numeric_check?.verdict === 'suspect') {
    badges.push({ label: '数字存疑', tone: 'amber' });
  }
  const caseHits = row.case_match?.matches?.length ?? 0;
  if (caseHits > 0) {
    badges.push({ label: `历史案例 ${caseHits}`, tone: 'sky' });
  }

  if (badges.length === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const toneCls: Record<'rose' | 'amber' | 'sky', string> = {
    rose: 'border border-rose-500/30 bg-rose-500/[0.10] text-rose-300',
    amber: 'border border-amber-500/30 bg-amber-500/[0.10] text-amber-300',
    sky: 'border border-sky-500/30 bg-sky-500/[0.10] text-sky-300',
  };
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span
          key={i}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toneCls[b.tone]}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

function ComplianceBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: '待人工', className: 'border border-amber-500/30 bg-amber-500/[0.10] text-amber-300' },
    rejected: { label: '已拒绝', className: 'border border-rose-500/30 bg-rose-500/[0.10] text-rose-300' },
    auto_approved: { label: '自动通过', className: 'border border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300' },
    manual_approved: { label: '人工通过', className: 'border border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300' },
  };
  const c = config[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

function EmptyState({ activeTab }: { activeTab: string }) {
  const messages: Record<string, string> = {
    pending: '目前没有待人工复核的变体。命中 B 级关键词或 LLM 判定为中等风险的变体会自动推到这里。',
    rejected: '还没有被拒绝的变体。',
    approved: '还没有已通过的变体。',
  };
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
      {messages[activeTab] ?? '暂无数据'}
    </div>
  );
}
