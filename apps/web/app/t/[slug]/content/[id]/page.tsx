import Link from 'next/link';
import { notFound } from 'next/navigation';
import { scoreGeoL2, type GeoL2Score, type ExtractedSlices } from '@geo/geo-core';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';
import { fmtDateTime } from '@/lib/format';
import { GenerateVariantsForm } from './generate-variants-form';
import { DeriveForm } from './derive-form';
import { ManualPassButton } from './manual-pass-button';

export const dynamic = 'force-dynamic';

type VariantRow = {
  id: string;
  platform: string;
  title: string;
  body: string;
  status: string;
  compliance_status: string;
  geo_tactics: string[];
  extra_assets: { llm_provider?: string; notes?: string } | null;
  created_at: string;
};

export default async function ContentDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const tenant = await requireTenantMember(params.slug);
  const supabase = createSupabaseServerClient();

  const { data: item } = await supabase
    .from('content_items')
    .select('id, title, source_type, status, topics, markdown, slices, dod_status, dod_score, dod_evidence, source_url, created_at, updated_at')
    .eq('id', params.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!item) notFound();

  // D21 / ADR 009 — pull brand for entity context, compute L2 score on render.
  // L2 is millisecond-fast pure rules; no caching needed.
  const { data: brandRow } = await supabase
    .from('brands')
    .select('name, location')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const brandLoc = (brandRow?.location ?? {}) as { city?: string };
  const l2 = item.markdown
    ? scoreGeoL2({
        title: item.title,
        body: item.markdown,
        ctx: {
          brand_name: brandRow?.name ?? undefined,
          city: typeof brandLoc.city === 'string' ? brandLoc.city : undefined,
          is_medical: true,
        },
      })
    : null;
  const slices = (item.slices ?? {}) as ExtractedSlices;

  const { data: variants } = await supabase
    .from('content_variants')
    .select(
      'id, platform, title, body, status, compliance_status, geo_tactics, extra_assets, created_at',
    )
    .eq('content_item_id', params.id)
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const variantRows = (variants ?? []) as VariantRow[];

  // VAR-2 — count by platform; passed down to GenerateVariantsForm so
  // operators see "toutiao_article 已有 3 条" before re-clicking生成.
  const existingPlatformCounts: Record<string, number> = {};
  for (const v of variantRows) {
    existingPlatformCounts[v.platform] = (existingPlatformCounts[v.platform] ?? 0) + 1;
  }

  const canEdit = (['owner', 'admin', 'operator'] as const).includes(
    tenant.role as 'owner' | 'admin' | 'operator',
  );
  const generateDisabled = !canEdit || item.status === 'draft';
  const disabledReason = !canEdit
    ? '你的角色无权生成变体。'
    : item.status === 'draft'
      ? '内容正在解析,请等解析完成后再生成变体。'
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/t/${tenant.slug}/content`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← 返回内容列表
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="uppercase tracking-wider">{item.source_type}</span>
          <span>·</span>
          <span>{item.status}</span>
          <span>·</span>
          <span>创建于 {fmtDateTime(item.created_at)}</span>
          <span>·</span>
          <span>更新于 {fmtDateTime(item.updated_at)}</span>
        </div>
        {item.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.topics.map((t: string) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      {item.status === 'draft' && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.10] p-4 text-sm text-amber-200">
          <p className="font-medium">正在解析中</p>
          <p className="mt-1 text-xs">Worker 正在处理这个文件。30 秒内刷新应该能看到内容。</p>
        </div>
      )}

      {l2 && (
        <D21ScoreCard
          score={l2}
          slices={slices}
          dodStatus={(item.dod_status ?? 'unknown') as string}
          dodEvidence={(item.dod_evidence ?? {}) as { reasons?: string[]; missing_slices?: string[] }}
          tenantSlug={tenant.slug}
          contentItemId={item.id}
          canManualPass={(['owner', 'admin'] as const).includes(
            tenant.role as 'owner' | 'admin',
          )}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">正文(解析后)</h2>
        {item.markdown ? (
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-5 font-sans text-sm leading-relaxed">
            {item.markdown}
          </pre>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
            暂无内容。上传完成后 worker 会自动解析并填入。
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">生成平台变体</h2>
        <GenerateVariantsForm
          tenantSlug={tenant.slug}
          contentItemId={item.id}
          existingCounts={existingPlatformCounts}
          disabled={generateDisabled}
          disabledReason={disabledReason}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">已生成变体</h2>
          <span className="text-xs text-muted-foreground">{variantRows.length} 条</span>
        </div>
        {variantRows.length > 0 ? (
          <VariantsTable variants={variantRows} tenantSlug={tenant.slug} />
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
            <p>还没生成过变体,或者刚刚提交的还在 Worker 队列里(每条 30-60 秒)。</p>
            <p className="mt-1.5 text-xs">
              👆 上面选好平台点「生成 N 条」,1-3 分钟后刷新此页面就能看到。
            </p>
          </div>
        )}
      </section>

      {canEdit && item.status === 'ai_drafted' && item.markdown ? (
        <details className="rounded-md border border-border bg-muted/10 p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            高级:基于这篇再写一组(派生新主题)
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              和上面「生成平台变体」不同 —— 派生会基于本篇重新跑一次 RAG 检索,
              产生 <strong>独立的新内容条目</strong>(不属于这篇)。适合从一篇热门文章扩展出多篇衍生选题。
            </p>
            <DeriveForm tenantSlug={tenant.slug} contentItemId={item.id} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function VariantsTable({ variants, tenantSlug }: { variants: VariantRow[]; tenantSlug: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">平台</th>
            <th className="px-4 py-2 font-medium">标题</th>
            <th className="px-4 py-2 font-medium">GEO 技法</th>
            <th className="px-4 py-2 font-medium">合规</th>
            <th className="px-4 py-2 font-medium">生成于</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {variants.map((v) => (
            <tr key={v.id} className="hover:bg-muted/30">
              <td className="px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                {v.platform.replace(/_/g, ' ')}
                {v.extra_assets?.llm_provider === 'stub' && (
                  <span className="ml-1.5 rounded-sm bg-amber-500/[0.12] px-1 text-[10px] text-amber-300">
                    STUB
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <Link
                  href={`/t/${tenantSlug}/compliance/${v.id}`}
                  className="font-medium hover:underline"
                >
                  {v.title}
                </Link>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {v.body.slice(0, 120)}
                  {v.body.length > 120 && '…'}
                </p>
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-1">
                  {v.geo_tactics.slice(0, 3).map((t) => (
                    <span key={t} className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px]">
                      {t.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {v.geo_tactics.length > 3 && (
                    <span className="text-[10px]">+{v.geo_tactics.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <ComplianceBadge status={v.compliance_status} />
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {fmtDateTime(v.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * D21 / ADR 009 — L2 score card. Rendered server-side from scoreGeoL2.
 * 5 dimensions + total; expandable evidence per dimension; slices preview
 * shows what the extractor pulled out of the body.
 */
function D21ScoreCard({
  score,
  slices,
  dodStatus,
  dodEvidence,
  tenantSlug,
  contentItemId,
  canManualPass,
}: {
  score: GeoL2Score;
  slices: ExtractedSlices;
  dodStatus: string;
  dodEvidence: { reasons?: string[]; missing_slices?: string[] };
  tenantSlug: string;
  contentItemId: string;
  canManualPass: boolean;
}) {
  const DIM_LABELS: Record<string, { label: string; weight: number }> = {
    trust_block_completeness: { label: 'Trust Block 完整度', weight: 30 },
    entity_explicitness: { label: '实体显式度', weight: 25 },
    citation_worthiness: { label: '引用块可抽取性', weight: 20 },
    query_coverage: { label: '主问题覆盖', weight: 15 },
    sliceability: { label: '可切片度', weight: 10 },
  };

  const totalColor =
    score.total >= 75
      ? 'text-emerald-300'
      : score.total >= 55
        ? 'text-amber-300'
        : 'text-rose-300';

  const sliceCount = countExtractedSlices(slices);

  return (
    <section className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/[0.05] p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            ✦ D21 标准评分
            <span className="rounded-full bg-emerald-500/[0.15] px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
              L2 rule engine
            </span>
            <DodBadge status={dodStatus} />
          </h2>
          <p className="text-xs text-muted-foreground">
            5 维度结构合规检测 · DoD 闸门(failed 不可派单)
          </p>
        </div>
        <div className={`text-3xl font-semibold ${totalColor}`}>
          {score.total}
          <span className="ml-1 text-sm font-normal text-muted-foreground">/100</span>
        </div>
      </div>

      {dodStatus === 'failed' && (dodEvidence.reasons?.length ?? 0) > 0 && (
        <div className="space-y-2 rounded-md border border-rose-500/40 bg-rose-500/[0.10] p-3 text-xs text-rose-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="font-semibold">⚠ DoD 未通过 — 已自动从派单候选中剔除</div>
              <ul className="mt-1.5 space-y-0.5 pl-4 text-rose-200/90">
                {(dodEvidence.reasons ?? []).slice(0, 6).map((r, i) => (
                  <li key={i} className="list-disc">{r}</li>
                ))}
              </ul>
              {(dodEvidence.missing_slices?.length ?? 0) > 0 && (
                <div className="mt-2 text-[11px] text-rose-300/80">
                  缺失 slice:{(dodEvidence.missing_slices ?? []).join(' · ')}
                </div>
              )}
            </div>
            {canManualPass && (
              <div className="flex-shrink-0">
                <ManualPassButton tenantSlug={tenantSlug} contentItemId={contentItemId} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-5">
        {(Object.entries(score.breakdown) as Array<[
          keyof typeof score.breakdown,
          (typeof score.breakdown)[keyof typeof score.breakdown],
        ]>).map(([id, dim]) => {
          const meta = DIM_LABELS[id];
          if (!meta) return null;
          const ratio = dim.score / 100;
          const barColor = dim.unknown
            ? 'bg-muted'
            : ratio >= 0.75
              ? 'bg-emerald-500'
              : ratio >= 0.5
                ? 'bg-amber-500'
                : 'bg-rose-500';
          return (
            <details
              key={id}
              className="space-y-1.5 rounded-md border border-border bg-background/40 p-2.5"
            >
              <summary className="cursor-pointer space-y-1">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="truncate text-[11px] text-muted-foreground">{meta.label}</span>
                  <span className="text-xs font-medium">
                    {dim.unknown ? '—' : `${dim.score}`}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${barColor} transition-all`}
                    style={{ width: dim.unknown ? '0%' : `${dim.score}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground">
                  权重 {meta.weight}%
                  {dim.unknown && <span className="ml-1 text-amber-400">· 入参缺失</span>}
                </div>
              </summary>
              {dim.evidence && dim.evidence.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  {dim.evidence.slice(0, 8).map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              )}
              {dim.note && (
                <div className="mt-1 text-[10px] italic text-muted-foreground">{dim.note}</div>
              )}
            </details>
          );
        })}
      </div>

      {sliceCount > 0 && (
        <details className="rounded-md border border-border bg-background/40 p-3 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            ✂️ 已抽取的 typed slices ({sliceCount}) — 喂给 llms.txt / Schema JSON-LD / 追踪 matcher
          </summary>
          <div className="mt-3 space-y-3">
            {slices.direct_answer && (
              <SlicePreview label="direct_answer" body={slices.direct_answer} />
            )}
            {slices.myth_busting_block && (
              <SlicePreview label="myth_busting_block" body={slices.myth_busting_block} />
            )}
            {slices.when_to_seek_care && (
              <SlicePreview label="when_to_seek_care" body={slices.when_to_seek_care} />
            )}
            {slices.faq_pairs && slices.faq_pairs.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                  faq_pairs · {slices.faq_pairs.length} 条
                </div>
                <ul className="space-y-1.5">
                  {slices.faq_pairs.slice(0, 5).map((f, i) => (
                    <li key={i} className="rounded bg-muted/40 px-2 py-1.5">
                      <div className="font-medium">Q: {f.q}</div>
                      <div className="mt-0.5 text-muted-foreground">A: {f.a}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {slices.trust_block && Object.keys(slices.trust_block).length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                  trust_block · {Object.keys(slices.trust_block).length}/7 项
                </div>
                <ul className="space-y-0.5 rounded bg-muted/40 px-2 py-1.5">
                  {Object.entries(slices.trust_block).map(([k, v]) => (
                    <li key={k}>
                      <span className="text-muted-foreground">{k}:</span> {v}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {slices.entity_snapshot && Object.keys(slices.entity_snapshot).length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                  entity_snapshot
                </div>
                <ul className="space-y-0.5 rounded bg-muted/40 px-2 py-1.5">
                  {Object.entries(slices.entity_snapshot).map(([k, v]) => (
                    <li key={k}>
                      <span className="text-muted-foreground">{k}:</span> {v}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {sliceCount === 0 && (
        <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          没抽到 slices — 这篇是 V1.6 老内容,extractor 还没回填。新生成的 AI 草稿自动跑 extractor。
        </p>
      )}
    </section>
  );
}

function DodBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    passed: {
      label: '✓ DoD passed',
      className: 'border border-emerald-500/40 bg-emerald-500/[0.12] text-emerald-300',
    },
    failed: {
      label: '✗ DoD failed',
      className: 'border border-rose-500/40 bg-rose-500/[0.12] text-rose-300',
    },
    legacy_passed: {
      label: 'Legacy',
      className: 'border border-border bg-muted/50 text-muted-foreground',
    },
    manual_pass: {
      label: '✓ Manual pass',
      className: 'border border-amber-500/40 bg-amber-500/[0.12] text-amber-300',
    },
    unknown: {
      label: 'Pending',
      className: 'border border-border bg-muted/40 text-muted-foreground',
    },
  };
  const c = config[status] ?? config.unknown!;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${c.className}`}>
      {c.label}
    </span>
  );
}

function SlicePreview({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
        {label}
      </div>
      <div className="rounded bg-muted/40 px-2 py-1.5">{body}</div>
    </div>
  );
}

function countExtractedSlices(slices: ExtractedSlices): number {
  let n = 0;
  if (slices.direct_answer) n++;
  if (slices.summary_1) n++;
  if (slices.summary_3) n++;
  if (slices.myth_busting_block) n++;
  if (slices.when_to_seek_care) n++;
  if (slices.faq_pairs && slices.faq_pairs.length > 0) n++;
  if (slices.comparison_points && slices.comparison_points.length > 0) n++;
  if (slices.entity_snapshot && Object.keys(slices.entity_snapshot).length > 0) n++;
  if (slices.trust_block && Object.keys(slices.trust_block).length > 0) n++;
  return n;
}

function ComplianceBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: '审查中', className: 'bg-amber-500/[0.10] text-amber-300 border border-amber-500/30' },
    rejected: { label: '已拒绝', className: 'bg-rose-500/[0.10] text-rose-300 border border-rose-500/30' },
    auto_approved: { label: '自动通过', className: 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30' },
    manual_approved: { label: '人工通过', className: 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30' },
  };
  const c = config[status] ?? { label: status, className: 'bg-muted' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}
