import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import {
  computeCitationInsights,
  buildSourceMap,
  capacityMismatch,
  type PublishedRowInput,
  type SnapshotRowInput,
  type SourceBucket,
} from '@geo/geo-core';

export const dynamic = 'force-dynamic';

/**
 * 回路看板(docs/08 愿景 + docs/11 P1-3/P1-4/P2 v0)——
 * 「发布 → 被 AI 引用 → 下一步行动」四个反馈回路一页看全:
 *   ① LLM 生产健康(欠费/限流当天可见)
 *   ② AI 答案污染(投诉/处罚源混入品牌答案)
 *   ③ 引用池测绘(引擎实际取用谁 · 产能错配度)
 *   ④ 平台发布→引用回路(哪个平台在赚引用)
 *   ⑤ 时效刷新候选(发布 45 天未被引,安排员工更新)
 * 计算逻辑在 @geo/geo-core/tracking/citation-insights(与每日早报共用同一纯函数)。
 */
export default async function LoopsPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  // ── 取数(数据访问在 app 层,计算在 packages 纯函数) ──
  const [pubRes, snapRes, llmFailRes] = await Promise.all([
    supabase
      .from('publish_tasks')
      .select('published_url, published_at, content_variants!inner(platform, title)')
      .eq('tenant_id', tenant.id)
      .eq('status', 'published')
      .not('published_url', 'is', null)
      .is('deleted_at', null),
    supabase
      .from('geo_snapshots')
      .select('citation_urls, question_id, created_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'done')
      .not('citation_urls', 'is', null),
    supabase
      .from('audit_logs')
      .select('payload, created_at', { count: 'exact' })
      .eq('tenant_id', tenant.id)
      .eq('action', 'content.variant_generate_failed')
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const published: PublishedRowInput[] = ((pubRes.data ?? []) as Array<{
    published_url: string;
    published_at: string | null;
    content_variants: { platform: string; title: string } | { platform: string; title: string }[];
  }>).map((row) => {
    const cv = Array.isArray(row.content_variants) ? row.content_variants[0] : row.content_variants;
    return {
      published_url: row.published_url,
      published_at: row.published_at,
      platform: cv?.platform ?? 'unknown',
      title: cv?.title ?? null,
    };
  });
  const snapshots = (snapRes.data ?? []) as SnapshotRowInput[];
  const insights = computeCitationInsights({ published, snapshots });

  const llmFailCount = llmFailRes.count ?? 0;
  const llmLatestReason =
    ((llmFailRes.data?.[0]?.payload as { reason?: string } | null)?.reason ?? null) as string | null;
  const llmOverdue = !!llmLatestReason?.match(/[Oo]verdue|欠费/);

  // 污染告警的题目文本
  const pollutionQids = [...new Set(insights.pollution.map((p) => p.question_id))];
  const qTextMap = new Map<string, string>();
  if (pollutionQids.length > 0) {
    const { data: qRows } = await supabase.from('questions').select('id, text').in('id', pollutionQids);
    for (const q of qRows ?? []) qTextMap.set(q.id as string, q.text as string);
  }

  const PLATFORM_LABEL: Record<string, string> = {
    toutiao_article: '今日头条',
    zhihu: '知乎',
    wechat_mp: '公众号',
    xiaohongshu: '小红书',
    douyin_script: '抖音',
    baijiahao: '百家号',
    souhu: '搜狐号',
  };
  const totalPublished = insights.platform_loop.reduce((s, p) => s + p.published, 0);
  const totalCited = insights.platform_loop.reduce((s, p) => s + p.cited, 0);
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('zh-CN') : '—');

  // ── 引用池测绘(2026-08-22 新增)──
  // 平台回路表回答「我方发的东西被引了几篇」,但看不见分母:引用池里还有谁。
  // 实测把全部引用源 URL 归类后发现,产能 100% 投在只占一成的池子里,而占
  // 七成的医疗垂直门户零覆盖 —— 这个错配在只看我方平台的表里完全不可见。
  const allCitationUrls = snapshots.flatMap((s) => s.citation_urls ?? []);
  const ourArticleIds = published
    .map((p) => p.published_url?.match(/(\d{9,})/)?.[1])
    .filter((x): x is string => !!x);
  const sourceMap = buildSourceMap({ urls: allCitationUrls, ourArticleIds });

  // 我方产能按池子归集 —— 判断产能压在哪个池子上
  const { data: capacityRows } = await supabase
    .from('content_variants')
    .select('platform')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const capacityByBucket: Partial<Record<SourceBucket, number>> = {};
  const capacityByPlatform = new Map<string, number>();
  for (const row of capacityRows ?? []) {
    const platform = (row as { platform: string }).platform;
    capacityByPlatform.set(platform, (capacityByPlatform.get(platform) ?? 0) + 1);
    const bucket: SourceBucket = platform.startsWith('douyin') ? 'short_video' : 'self_media';
    capacityByBucket[bucket] = (capacityByBucket[bucket] ?? 0) + 1;
  }
  const mismatch = capacityMismatch({ poolShares: sourceMap.buckets, capacityByBucket });
  const capacityShare = (b: SourceBucket) =>
    mismatch.details.find((d) => d.bucket === b)?.capacity ?? 0;
  const unknownBucket = sourceMap.buckets.find((b) => b.bucket === 'unknown');
  const unknownTop = unknownBucket?.top_domains[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="回路看板"
        subtitle={`发布 → 被 AI 引用 → 下一步行动 · 累计 ${totalPublished} 篇发布 / ${totalCited} 篇被引`}
        actions={
          <Link
            href={`/t/${tenant.slug}/tracking`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-card"
          >
            查看追踪快照 →
          </Link>
        }
      />

      <InlineGuide
        storageKey={`guide:loops:${tenant.slug}`}
        title="这页在回答什么问题"
        body={
          '这里是 GEO 运营的「仪表盘 + 行动清单」:内容发出去之后,AI 引擎(豆包 / DeepSeek)有没有引用?哪个平台在赚引用?答案里有没有混进对品牌不利的信源?哪些老内容该更新了?\n\n' +
          '每个区块都对应一个动作 — 看到红色就处理,没有红色说明回路健康。同样的数字每天 09:00 也会出现在早报邮件里。'
        }
        steps={[
          '红色告警(LLM 失败 / 答案污染)当天处理',
          '平台引用率连续为 0 的渠道,和运营讨论要不要停投',
          '时效候选安排员工更新文章(改更新时间 + 小幅补充),观察被引变化',
        ]}
      />

      {/* ① LLM 生产健康 */}
      {llmFailCount > 0 ? (
        <section className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-5 py-4">
          <h2 className="text-sm font-semibold text-rose-400">
            🔴 LLM 生成失败 {llmFailCount} 次(近 24 小时)
            {llmOverdue ? ' — 疑似火山方舟欠费,请立即充值' : ''}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            最近原因:{(llmLatestReason ?? '未知').slice(0, 140)}
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-5 py-3">
          <p className="text-xs text-emerald-400">✓ LLM 生产健康 — 近 24 小时无生成失败</p>
        </section>
      )}

      {/* ② AI 答案污染 */}
      <section className="rounded-lg border border-border bg-card/40 px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          🚨 AI 答案污染监测<span className="ml-2 text-xs font-normal text-muted-foreground">近 7 天</span>
        </h2>
        {insights.pollution.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {insights.pollution.map((p, i) => (
              <li
                key={i}
                className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-foreground"
              >
                「{qTextMap.get(p.question_id) ?? p.question_id}」的 AI 答案引用了{' '}
                <span className="font-semibold text-rose-400">{p.domain_label}</span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-muted-foreground underline decoration-dotted hover:text-foreground"
                >
                  查看来源
                </a>
                <p className="mt-1 text-muted-foreground">
                  行动:核实是否为同名机构的负面被算到本品牌头上(实体混淆);若是,加强官网/内容里的机构全称 + 城市锚定。
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">✓ 近 7 天追踪答案未发现投诉 / 行政处罚类风险源</p>
        )}
      </section>

      {/* ③ 引用池测绘 — 平台回路的分母 */}
      <section className="rounded-lg border border-border bg-card/40 px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          🗺️ 引用池测绘
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            引擎实际取用了谁 · 共 {sourceMap.total} 条引用源
          </span>
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          下面这张表的分母是<strong className="text-foreground">整个引用池</strong>,不是我方发布量。
          它回答的问题是:我们的产能,投在了引擎真正取内容的地方吗?
        </p>

        {sourceMap.total === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            暂无引用源数据 — 需要先有成功的追踪快照(带引用源采集)。
          </p>
        ) : (
          <>
            <div
              className={`mt-3 rounded-md border px-4 py-3 ${
                mismatch.score > 0.6
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : mismatch.score > 0.3
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-emerald-500/20 bg-emerald-500/5'
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs text-muted-foreground">产能错配度</span>
                <span
                  className={`text-2xl font-semibold tabular-nums ${
                    mismatch.score > 0.6
                      ? 'text-rose-400'
                      : mismatch.score > 0.3
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }`}
                >
                  {(mismatch.score * 100).toFixed(0)}%
                </span>
                <span className="text-[11px] text-muted-foreground">
                  0% = 产能分布与引用池完全对齐 · 100% = 完全押错地方(只计可投放的池子)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="mt-3 w-full min-w-[38rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 font-medium">渠道池</th>
                    <th className="py-2 text-right font-medium">被引</th>
                    <th className="py-2 text-right font-medium">占引用池</th>
                    <th className="py-2 text-right font-medium">我方产能</th>
                    <th className="py-2 text-right font-medium">缺口</th>
                    <th className="py-2 pl-4 font-medium">主要站点</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceMap.buckets.map((b) => {
                    const cap = capacityShare(b.bucket);
                    const gap = b.actionable ? b.share - cap : null;
                    // 机会 = 可投放 + 池子够大 + 我方产能明显不足
                    const opportunity = b.actionable && b.share >= 0.05 && cap < b.share / 3;
                    return (
                      <tr key={b.bucket} className="border-b border-border/50">
                        <td className="py-2">
                          <span className="text-foreground">{b.label}</span>
                          {opportunity && (
                            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                              机会
                            </span>
                          )}
                          {!b.actionable && (
                            <span className="ml-2 text-[10px] text-muted-foreground">不可投放</span>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums text-foreground">{b.citations}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">
                          {(b.share * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {b.actionable ? `${(cap * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums ${
                            gap === null
                              ? 'text-muted-foreground'
                              : gap > 0.05
                                ? 'text-amber-400'
                                : gap < -0.05
                                  ? 'text-rose-400'
                                  : 'text-muted-foreground'
                          }`}
                        >
                          {gap === null
                            ? '—'
                            : `${gap > 0 ? '+' : ''}${(gap * 100).toFixed(0)}pp`}
                        </td>
                        <td className="py-2 pl-4 text-muted-foreground">
                          {b.top_domains
                            .slice(0, 3)
                            .map((d) => `${d.domain}(${d.count})`)
                            .join('  ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-amber-400">机会</strong> = 可主动投放 + 占引用池 ≥5% + 我方产能不足其三分之一。
              <strong className="text-rose-400">负缺口</strong> = 产能超配,投入远超该池实际回报。
              {unknownBucket && (
                <>
                  {' '}未归类 {unknownBucket.citations} 条(最大单站仅 {unknownTop} 次),为长尾碎片而非遗漏的大源;
                  若某个未归类站点次数明显上升,应补进 `citation-source-map.ts` 规则表。
                </>
              )}
            </p>
          </>
        )}
      </section>

      {/* ④ 平台发布→引用回路 */}
      <section className="rounded-lg border border-border bg-card/40 px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          📡 平台回路<span className="ml-2 text-xs font-normal text-muted-foreground">累计 · 文章 ID 级匹配</span>
        </h2>
        <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[24rem] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 font-medium">平台</th>
              <th className="py-2 text-right font-medium">已发布</th>
              <th className="py-2 text-right font-medium">被 AI 引用</th>
              <th className="py-2 text-right font-medium">引用率</th>
            </tr>
          </thead>
          <tbody>
            {insights.platform_loop.map((p) => {
              const zero = p.cited === 0 && p.published >= 20;
              return (
                <tr key={p.platform} className="border-b border-border/50">
                  <td className="py-2 text-foreground">{PLATFORM_LABEL[p.platform] ?? p.platform}</td>
                  <td className="py-2 text-right text-foreground">{p.published}</td>
                  <td className={`py-2 text-right font-semibold ${zero ? 'text-rose-400' : 'text-foreground'}`}>
                    {p.cited}
                  </td>
                  <td className={`py-2 text-right ${zero ? 'text-rose-400' : 'text-muted-foreground'}`}>
                    {p.published > 0 ? `${((100 * p.cited) / p.published).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          红色 = 发布 ≥20 篇但引用为 0(结构性无回报信号)。知乎已于 2026-07-03 停投(豆包 + DeepSeek
          引用池中 zhihu.com 均为 0),产能转投区县级选题覆盖。
        </p>
      </section>

      {/* ⑤ 时效刷新候选 */}
      <section className="rounded-lg border border-border bg-card/40 px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          ⏳ 时效刷新候选
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            发布 &gt;45 天且未被引 · 共 {insights.stale_uncited.count} 篇
          </span>
        </h2>
        {insights.stale_uncited.examples.length > 0 ? (
          <>
            <ul className="mt-3 space-y-1.5">
              {insights.stale_uncited.examples.map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-foreground">{e.title}</span>
                  <span className="flex-shrink-0 text-muted-foreground">
                    {PLATFORM_LABEL[e.platform] ?? e.platform} · {fmtDate(e.published_at)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              行动:让发布该文的员工打开原文,小幅补充内容并保存(平台会刷新编辑时间 =
              时效信号)。先更新几篇观察被引变化,有效再批量推进。
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">✓ 暂无候选 — 已发布内容要么被引用过,要么还很新</p>
        )}
      </section>
    </div>
  );
}
