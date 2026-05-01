import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { fmtDateTime } from '@/lib/format';
import { InlineGuide } from '@/components/inline-guide';
import { ForceSyncButton } from './force-sync-button';

export const dynamic = 'force-dynamic';

export default async function KnowledgeSettingsPage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin']);
  const supabase = createSupabaseServerClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  const [
    { count: total },
    { count: addedLast7d },
    { count: updatedLast7d },
    { count: deletedLast7d },
    { data: latestRows },
    { data: byCategory },
    { count: complianceCount },
    { count: staffSynced },
    { count: vocabCount },
  ] = await Promise.all([
    supabase
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null),
    supabase
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', sevenDaysAgo)
      .is('deleted_at', null),
    supabase
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('updated_at', sevenDaysAgo)
      .lt('created_at', sevenDaysAgo)
      .is('deleted_at', null),
    supabase
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('deleted_at', sevenDaysAgo),
    supabase
      .from('knowledge_sources')
      .select('source_path, title, indexed_at, byte_size, updated_at')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(8),
    supabase
      .from('knowledge_sources')
      .select('category')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null),
    supabase
      .from('compliance_keywords')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .not('source_path', 'is', null),
    supabase
      .from('staff_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .not('bio_md_path', 'is', null)
      .is('deleted_at', null),
    supabase
      .from('brand_vocab')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .in('term_type', ['doctor', 'service', 'competitor'])
      .is('deleted_at', null),
  ]);

  const lastIndexed = latestRows?.[0]?.indexed_at as string | null | undefined;
  const lastIndexedAge = lastIndexed
    ? Math.round((Date.now() - new Date(lastIndexed).getTime()) / 60_000)
    : null;

  const categoryStats = countBy((byCategory ?? []) as Array<{ category: string | null }>);

  return (
    <div className="space-y-8">
      <PageHeader
        title="知识库"
        subtitle="客户 markdown 知识库 → 同步状态 / 派生数据 / 立即重扫"
        actions={<ForceSyncButton tenantSlug={tenant.slug} />}
      />

      <InlineGuide
        storageKey={`guide:settings-kb:${tenant.slug}`}
        title="这页是干嘛的"
        body={'知识库是整个内容生产 + 合规 + 派单的「上游水源」。客户的科普文 / 临床指南 / 病例 / 医生介绍以 markdown 文件存进来,worker 每 5 分钟扫一次:新文件 / 修改 / 删除都会触发对应下游(合规词库 / 医生标签 / 品牌词典)的自动重建。AI 起草 + 变体改写都会读 KB 上下文,降低 LLM 幻觉。'}
        steps={[
          '上传新 md 文件:放进客户 KB 目录(运维侧操作),worker 自动发现',
          '"立即重扫"按钮 → 跳过 5 分钟扫描周期,马上同步',
          '建议至少 20 篇起步,按"医生介绍 / 治疗项目 / 科普 / 病例"四类分文件夹',
        ]}
      />

      {/* === Top-level KPIs === */}
      <section>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="索引篇数" value={total ?? 0} sub="只计算未删除的 md" />
          <Stat
            label="最近同步"
            value={lastIndexedAge !== null ? `${lastIndexedAge} 分钟前` : '尚未'}
            sub={lastIndexed ? fmtDateTime(lastIndexed) : '等待 worker 跑首次同步'}
            tone={lastIndexedAge === null ? 'warn' : lastIndexedAge > 30 ? 'warn' : 'ok'}
          />
          <Stat label="近 7 天新增" value={addedLast7d ?? 0} />
          <Stat label="近 7 天修改" value={updatedLast7d ?? 0} sub={`删除 ${deletedLast7d ?? 0}`} />
        </div>
      </section>

      {/* === Derived data status === */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">派生数据</h2>
        <p className="text-xs text-muted-foreground">
          每次知识库同步后自动重建。数据来源始终是 md 文件,代码内不留 hardcoded。
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <DerivedCard
            label="合规词库"
            count={complianceCount ?? 0}
            from="合规/广告法/红线词库.md"
            href={`/t/${tenant.slug}/help#compliance`}
          />
          <DerivedCard
            label="员工档案(KB 同步)"
            count={staffSynced ?? 0}
            from="团队/医生/*.md"
            href={`/t/${tenant.slug}/settings/staff`}
          />
          <DerivedCard
            label="品牌词典(KB 同步)"
            count={vocabCount ?? 0}
            from="团队/医生/* + 诊疗/项目库/* + 医院/竞品/*"
            href={`/t/${tenant.slug}/settings/vocab`}
          />
        </div>
      </section>

      {/* === Category breakdown === */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">分类分布</h2>
        <div className="rounded-md border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">类别</th>
                <th className="px-4 py-2 font-medium text-right">篇数</th>
                <th className="px-4 py-2 font-medium">分布</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categoryStats.map((c) => (
                <tr key={c.name}>
                  <td className="px-4 py-2 font-medium">{c.name || '(未分类)'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.count}</td>
                  <td className="px-4 py-2">
                    <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${(c.count / Math.max(...categoryStats.map((x) => x.count), 1)) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === Recently changed === */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">最近变更</h2>
        <ul className="divide-y divide-border rounded-md border border-border bg-background">
          {(latestRows ?? []).length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">尚无索引数据</li>
          ) : (
            (latestRows ?? []).map((r: { source_path: string; title: string | null; updated_at: string; byte_size: number }) => (
              <li key={r.source_path} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="truncate">
                    <span className="font-medium">{r.title ?? r.source_path}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.source_path}</span>
                  </span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {(r.byte_size / 1024).toFixed(1)} KB · {fmtDateTime(r.updated_at)}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* === How sync works === */}
      <section className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm">
        <p className="mb-2 font-medium text-foreground">同步链路</p>
        <p className="leading-6 text-muted-foreground">
          你 Mac 上 <code className="rounded bg-muted px-1">~/Workspace/songshu-knowledge-base/</code> 编辑 md
          → fswatch 30 秒防抖触发 rsync → ECS 镜像目录 <code className="rounded bg-muted px-1">/opt/kb/松鼠/</code>
          → pg-boss worker 每 5 分钟扫描 hash 差异 → 写入 knowledge_sources 表 → 自动重建合规词库 / 医生 / 品牌词典。
        </p>
        <p className="mt-2 leading-6 text-muted-foreground">
          急用时点上方「立即重扫」按钮,worker 心跳 5s 内拉起这次 sync,大约 20-30 秒后该页面会刷新。
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        <Link href={`/t/${tenant.slug}/settings`} className="hover:underline">
          ← 返回设置
        </Link>
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = 'ok',
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === 'warn' ? 'text-amber-700' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function DerivedCard({
  label,
  count,
  from,
  href,
}: {
  label: string;
  count: number;
  from: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-border bg-background p-4 hover:bg-muted/40"
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={from}>
        来自 {from}
      </p>
    </Link>
  );
}

function countBy(rows: Array<{ category: string | null }>): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = r.category ?? '';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
