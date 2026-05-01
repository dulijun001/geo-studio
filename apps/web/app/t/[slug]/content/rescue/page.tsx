/**
 * 老内容效果迭代 — 给低分变体显示「AI 救援」入口.
 *
 * 进入条件(任一):
 *   - geo_score.total < 80
 *   - status = 'published' 但 created_at > 30 天前 + 没产生引用
 *
 * UI 是简单列表,运营选「AI 救援」 → 服务端调用 generateVariant 时
 * 注入 rewrite_hint(基于本变体的弱项),产出一条新变体放入同一个
 * content_item,走完整合规审核流程.
 */
import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import { RescueButton } from './rescue-button';

export const dynamic = 'force-dynamic';

const RESCUE_SCORE_THRESHOLD = 80;

const PLATFORM_LABEL: Record<string, string> = {
  toutiao_article: '今日头条',
  douyin_script: '抖音',
  wechat_mp: '公众号',
  zhihu: '知乎',
  xiaohongshu: '小红书',
  baijiahao: '百家号',
};

type VariantRow = {
  id: string;
  content_item_id: string;
  platform: string;
  title: string;
  status: string;
  compliance_status: string;
  geo_score: { total?: number; breakdown?: Record<string, { score: number; max: number }> } | null;
  created_at: string;
};

export default async function RescuePage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  // 拉所有有 geo_score 的变体,按总分升序(最差的排上面)
  const { data: rows } = await supabase
    .from('content_variants')
    .select('id, content_item_id, platform, title, status, compliance_status, geo_score, created_at')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .not('geo_score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);

  const all = (rows ?? []) as VariantRow[];
  const candidates = all.filter((r) => {
    const total = r.geo_score?.total ?? 0;
    return total < RESCUE_SCORE_THRESHOLD;
  });

  // Group by score buckets for visual clarity
  const buckets = {
    critical: candidates.filter((c) => (c.geo_score?.total ?? 0) < 50),
    weak: candidates.filter((c) => (c.geo_score?.total ?? 0) >= 50 && (c.geo_score?.total ?? 0) < 65),
    borderline: candidates.filter((c) => (c.geo_score?.total ?? 0) >= 65 && (c.geo_score?.total ?? 0) < 80),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="老内容效果迭代"
        subtitle={`列出 GEO 评分 < ${RESCUE_SCORE_THRESHOLD} 的变体,可一键 AI 重写补强弱项`}
      />

      <InlineGuide
        storageKey={`guide:rescue:${tenant.slug}`}
        title="这页是干嘛的"
        body={'被发现 GEO 评分太低或发布超过 30 天没引用的"内容资产",在这里集中救援。点 "AI 救援" 系统会读这条变体的弱项(缺权威引用 / 数据 / 引语等),针对性重写一份新版本,走完整合规审核后替换上去。等于把死掉的老内容回炉重造,不用从头写。'}
        steps={[
          '红 / 黄 / 绿 三档分布:🔴 紧急 < 50,🟡 较弱 50-64,🟢 临界 65-79',
          '点单条卡片右侧"AI 救援"按钮 → 系统 60-130s 出新变体 → 进合规审核',
          '救援后保留旧版本作为版本谱系,不删,以后回看哪条效果好',
        ]}
      />

      <section className="card-surface p-5">
        <h2 className="mb-3 text-sm font-medium">分布概览</h2>
        <div className="grid grid-cols-3 gap-3">
          <BucketStat label="🔴 紧急(< 50)" value={buckets.critical.length} tone="rose" />
          <BucketStat label="🟡 较弱(50-64)" value={buckets.weak.length} tone="amber" />
          <BucketStat label="🟢 临界(65-79)" value={buckets.borderline.length} tone="sky" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          AI 救援会读取该变体的弱项(数据/引用/关键词位置等),用一次额外的 LLM 调用重写,
          产出新变体进入同一内容条目下,需走完整合规审核才能派发。
        </p>
      </section>

      {candidates.length === 0 ? (
        <div className="rounded-md border border-dashed border-emerald-200 bg-emerald-50 p-8 text-center text-sm text-emerald-900">
          🎉 当前没有需要救援的变体,所有打分 ≥ {RESCUE_SCORE_THRESHOLD} 分。
        </div>
      ) : (
        <RescueGroup label="🔴 紧急(< 50 分)" items={buckets.critical} tenantSlug={tenant.slug} />
      )}
      {buckets.weak.length > 0 && (
        <RescueGroup label="🟡 较弱(50-64)" items={buckets.weak} tenantSlug={tenant.slug} />
      )}
      {buckets.borderline.length > 0 && (
        <RescueGroup label="🟢 临界(65-79)" items={buckets.borderline} tenantSlug={tenant.slug} />
      )}
    </div>
  );
}

function RescueGroup({
  label,
  items,
  tenantSlug,
}: {
  label: string;
  items: VariantRow[];
  tenantSlug: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="card-surface p-5">
      <h2 className="mb-3 text-sm font-medium">
        {label} <span className="ml-1 text-muted-foreground">({items.length})</span>
      </h2>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">分数</th>
              <th className="px-4 py-2 font-medium">平台</th>
              <th className="px-4 py-2 font-medium">标题</th>
              <th className="px-4 py-2 font-medium">弱项 TOP 2</th>
              <th className="px-4 py-2 font-medium">状态</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.slice(0, 30).map((v) => {
              const total = v.geo_score?.total ?? 0;
              const weak = pickWeakest(v.geo_score?.breakdown);
              return (
                <tr key={v.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono">
                    <ScoreChip total={total} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {PLATFORM_LABEL[v.platform] ?? v.platform}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/t/${tenantSlug}/compliance/${v.id}`}
                      className="hover:underline"
                    >
                      {v.title.length > 40 ? v.title.slice(0, 40) + '…' : v.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {weak.map((w) => (
                      <div key={w.key} className="text-muted-foreground">
                        {TACTIC_LABEL[w.key] ?? w.key} {w.score}/{w.max}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip status={v.status} compliance={v.compliance_status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RescueButton tenantSlug={tenantSlug} variantId={v.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BucketStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'rose' | 'amber' | 'sky';
}) {
  const cls = {
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
  }[tone];
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <div className="text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ScoreChip({ total }: { total: number }) {
  const tone = total < 50 ? 'bg-rose-100 text-rose-800' : total < 65 ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{total}</span>;
}

function StatusChip({ status, compliance }: { status: string; compliance: string }) {
  return (
    <span className="text-[11px] text-muted-foreground">
      {status} · {compliance}
    </span>
  );
}

const TACTIC_LABEL: Record<string, string> = {
  statistics: '数据',
  quotation: '引语',
  citation: '引用',
  fluency: '流畅',
  readability: '易读',
  keyword_freq: '关键词',
  position: '位置',
  unique: '独特',
  authority: '权威',
};

function pickWeakest(
  breakdown: Record<string, { score: number; max: number }> | undefined,
): Array<{ key: string; score: number; max: number; ratio: number }> {
  if (!breakdown) return [];
  return Object.entries(breakdown)
    .map(([key, t]) => ({ key, score: t.score, max: t.max, ratio: t.max > 0 ? t.score / t.max : 1 }))
    .filter((x) => x.ratio < 0.6)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 2);
}
