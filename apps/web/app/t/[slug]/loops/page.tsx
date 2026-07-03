import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import {
  computeCitationInsights,
  type PublishedRowInput,
  type SnapshotRowInput,
} from '@geo/geo-core';

export const dynamic = 'force-dynamic';

/**
 * 回路看板(docs/08 愿景 + docs/11 P1-3/P1-4/P2 v0)——
 * 「发布 → 被 AI 引用 → 下一步行动」四个反馈回路一页看全:
 *   ① LLM 生产健康(欠费/限流当天可见)
 *   ② AI 答案污染(投诉/处罚源混入品牌答案)
 *   ③ 平台发布→引用回路(哪个平台在赚引用)
 *   ④ 时效刷新候选(发布 45 天未被引,安排员工更新)
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

      {/* ③ 平台发布→引用回路 */}
      <section className="rounded-lg border border-border bg-card/40 px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          📡 平台回路<span className="ml-2 text-xs font-normal text-muted-foreground">累计 · 文章 ID 级匹配</span>
        </h2>
        <table className="mt-3 w-full text-left text-xs">
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
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          红色 = 发布 ≥20 篇但引用为 0(结构性无回报信号)。知乎已于 2026-07-03 停投(豆包 + DeepSeek
          引用池中 zhihu.com 均为 0),产能转投区县级选题覆盖。
        </p>
      </section>

      {/* ④ 时效刷新候选 */}
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
