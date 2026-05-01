import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { FunnelChart } from '@/components/funnel-chart';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  arrived: '到店',
  consulted: '咨询',
  treated: '治疗',
  paid: '付款',
  lost: '流失',
};

const STAGE_ORDER = ['arrived', 'consulted', 'treated', 'paid'] as const;

type FunnelCounts = {
  published_tasks: number;
  hooks_total: number;
  hooks_triggered: number;
  by_stage: Record<string, number>;
};

type ContentRow = {
  content_item_id: string;
  title: string;
  publish_count: number;
  triggered_hook_ids: Set<string>;
  by_stage: Record<string, number>;
};

export default async function AttributionPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator', 'auditor']);
  const supabase = createSupabaseServerClient();

  // ── all conversion_events, hooks, publish_tasks, variants, content_items ──
  // (Two-step joins because the schema has no DB-level FKs; PostgREST embeds
  // return nothing. Same pattern as publish/page.tsx.)
  const [eventsRes, tasksRes] = await Promise.all([
    supabase
      .from('conversion_events')
      .select('id, hook_id, stage, stage_at, notes')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('stage_at', { ascending: false })
      .limit(2000),
    supabase
      .from('publish_tasks')
      .select('id, variant_id, status, published_at')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .limit(2000),
  ]);

  type Event = { id: string; hook_id: string | null; stage: string; stage_at: string; notes: string | null };
  type Task = { id: string; variant_id: string; status: string; published_at: string | null };
  const events = (eventsRes.data ?? []) as Event[];
  const tasks = (tasksRes.data ?? []) as Task[];

  const hookIds = Array.from(
    new Set(events.map((e) => e.hook_id).filter((id): id is string => !!id)),
  );
  const variantIds = Array.from(new Set(tasks.map((t) => t.variant_id)));

  const [hooksRes, hooksAllRes, variantsRes] = await Promise.all([
    hookIds.length > 0
      ? supabase
          .from('hooks')
          .select('id, publish_task_id, hook_type, hook_value')
          .in('id', hookIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            publish_task_id: string;
            hook_type: string;
            hook_value: string;
          }>,
        }),
    supabase
      .from('hooks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id),
    variantIds.length > 0
      ? supabase
          .from('content_variants')
          .select('id, content_item_id, title')
          .in('id', variantIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; content_item_id: string; title: string }>,
        }),
  ]);

  type HookRow = { id: string; publish_task_id: string; hook_type: string; hook_value: string };
  type VariantRow = { id: string; content_item_id: string; title: string };
  const hooks = (hooksRes.data ?? []) as HookRow[];
  const hooksTotalCount = hooksAllRes.count ?? 0;
  const variants = (variantsRes.data ?? []) as VariantRow[];

  const variantById = new Map(variants.map((v) => [v.id, v]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const hookById = new Map(hooks.map((h) => [h.id, h]));

  const contentItemIds = Array.from(new Set(variants.map((v) => v.content_item_id)));
  const itemsRes =
    contentItemIds.length > 0
      ? await supabase.from('content_items').select('id, title').in('id', contentItemIds)
      : { data: [] as Array<{ id: string; title: string }> };
  type ItemRow = { id: string; title: string };
  const itemById = new Map(((itemsRes.data ?? []) as ItemRow[]).map((i) => [i.id, i]));

  // ── funnel ───────────────────────────────────────────────────────────────
  const funnel: FunnelCounts = {
    published_tasks: tasks.filter((t) => t.status === 'published').length,
    hooks_total: hooksTotalCount,
    hooks_triggered: new Set(events.map((e) => e.hook_id).filter(Boolean)).size,
    by_stage: { arrived: 0, consulted: 0, treated: 0, paid: 0, lost: 0 },
  };
  for (const e of events) funnel.by_stage[e.stage] = (funnel.by_stage[e.stage] ?? 0) + 1;

  // ── per-content ROI ──────────────────────────────────────────────────────
  const byContent = new Map<string, ContentRow>();
  for (const t of tasks) {
    const v = variantById.get(t.variant_id);
    if (!v) continue;
    const cid = v.content_item_id;
    if (!byContent.has(cid)) {
      byContent.set(cid, {
        content_item_id: cid,
        title: itemById.get(cid)?.title ?? '(已删除)',
        publish_count: 0,
        triggered_hook_ids: new Set(),
        by_stage: {},
      });
    }
    byContent.get(cid)!.publish_count += 1;
  }
  for (const e of events) {
    if (!e.hook_id) continue;
    const h = hookById.get(e.hook_id);
    if (!h) continue;
    const t = taskById.get(h.publish_task_id);
    if (!t) continue;
    const v = variantById.get(t.variant_id);
    if (!v) continue;
    const row = byContent.get(v.content_item_id);
    if (!row) continue;
    row.triggered_hook_ids.add(h.id);
    row.by_stage[e.stage] = (row.by_stage[e.stage] ?? 0) + 1;
  }

  const ranked = Array.from(byContent.values())
    .filter((r) => r.publish_count > 0)
    .sort((a, b) => b.triggered_hook_ids.size - a.triggered_hook_ids.size)
    .slice(0, 20);

  const funnelSteps = [
    { label: '已发布任务', value: funnel.published_tasks },
    { label: '钩子已发', value: funnel.hooks_total },
    { label: '钩子被回报', value: funnel.hooks_triggered },
    ...STAGE_ORDER.map((s) => ({ label: STAGE_LABEL[s] ?? s, value: funnel.by_stage[s] ?? 0 })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="转化归因"
        subtitle="多钩子自动回流(D6)· 患者通过暗号 / 医生名找回路径,自动归到具体内容。"
        actions={
          <Link
            href={`/c/${tenant.slug}/checkin`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            患者登记入口 →
          </Link>
        }
      />

      <InlineGuide
        storageKey={`guide:attribution:${tenant.slug}`}
        title="这页能告诉你哪些内容真的赚回了客户"
        body="员工发布的每条内容都自动带 6 位暗号。患者来店报暗号 → 系统反查到具体 publish_task → 进而追到 variant 和原始内容,把转化数字落到内容粒度。下面是当前漏斗。"
        linkLabel="完整工作流说明"
        linkHref={`/t/${tenant.slug}/help#attribution`}
      />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Stat label="已发布" value={funnel.published_tasks} />
        <Stat label="钩子已发" value={funnel.hooks_total} />
        <Stat label="钩子被回报" value={funnel.hooks_triggered} accent="emerald" />
        {STAGE_ORDER.map((s) => (
          <Stat key={s} label={STAGE_LABEL[s] ?? s} value={funnel.by_stage[s] ?? 0} />
        ))}
      </section>

      <section className="card-surface p-5">
        <h2 className="mb-4 text-sm font-medium text-foreground">主漏斗</h2>
        <FunnelChart steps={funnelSteps} />
      </section>

      <JourneysList tenantSlug={tenant.slug} tenantId={tenant.id} />

      {events.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">最近转化事件(点击查看完整溯源)</h2>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">时间</th>
                  <th className="px-4 py-2 font-medium">阶段</th>
                  <th className="px-4 py-2 font-medium">备注</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.slice(0, 20).map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {fmtDateTime(e.stage_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {STAGE_LABEL[e.stage] ?? e.stage}
                      </span>
                    </td>
                    <td className="max-w-[420px] truncate px-4 py-2.5 text-xs text-muted-foreground">
                      {e.notes ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/t/${tenant.slug}/attribution/${e.id}`}
                        className="text-xs font-medium text-indigo-700 hover:underline underline-offset-2"
                      >
                        溯源 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">单内容回流(Top 20)</h2>
        {ranked.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            还没有任何转化事件。等患者通过暗号在
            {' '}<code className="rounded bg-muted px-1">/c/{tenant.slug}/checkin</code>{' '}
            登记后,这里会出现内容回流分布。
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">内容</th>
                  <th className="px-4 py-2 font-medium">发布次数</th>
                  <th className="px-4 py-2 font-medium">触发钩子数</th>
                  {STAGE_ORDER.map((s) => (
                    <th key={s} className="px-4 py-2 font-medium">
                      {STAGE_LABEL[s] ?? s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ranked.map((r) => (
                  <tr key={r.content_item_id} className="hover:bg-muted/30">
                    <td className="max-w-[360px] truncate px-4 py-2.5 font-medium">
                      <Link
                        href={`/t/${tenant.slug}/content/${r.content_item_id}`}
                        className="hover:underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.publish_count}</td>
                    <td className="px-4 py-2.5 font-medium text-emerald-700">
                      {r.triggered_hook_ids.size}
                    </td>
                    {STAGE_ORDER.map((s) => (
                      <td key={s} className="px-4 py-2.5 text-muted-foreground">
                        {r.by_stage[s] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald';
}) {
  const accentClass =
    accent === 'emerald' ? 'text-emerald-700' : 'text-foreground';
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${accentClass}`}>{value}</div>
    </div>
  );
}

// ─── Journeys list — links to per-customer multi-touch attribution detail ──
async function JourneysList({
  tenantSlug,
  tenantId,
}: {
  tenantSlug: string;
  tenantId: string;
}) {
  const supabase = createSupabaseServerClient();
  const { data: identitiesRaw } = await supabase
    .from('customer_identities')
    .select('id, patient_ref, first_hook_value, created_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20);
  type Id = { id: string; patient_ref: string | null; first_hook_value: string | null; created_at: string };
  const identities = (identitiesRaw ?? []) as Id[];

  if (identities.length === 0) {
    return (
      <section className="card-surface space-y-2 p-5">
        <h2 className="text-sm font-medium">客户旅程归因(多触点)</h2>
        <p className="text-xs text-muted-foreground">
          还没有任何客户身份记录。在 <code className="font-mono">/c/{tenantSlug}/checkin</code> 着陆页登记时,
          填手机号后 4 位即可触发多触点归因 — 系统会把这位客户之前看过的内容串起来,
          然后用 3 种归因模型分别计算每条内容的功劳。
        </p>
      </section>
    );
  }

  // For each identity get touchpoint count (cheap aggregate)
  const ids = identities.map((i) => i.id);
  const { data: tpsRaw } = await supabase
    .from('journey_touchpoints')
    .select('identity_id')
    .in('identity_id', ids)
    .is('deleted_at', null);
  type Tp = { identity_id: string };
  const tpCount = new Map<string, number>();
  for (const r of (tpsRaw ?? []) as Tp[]) {
    tpCount.set(r.identity_id, (tpCount.get(r.identity_id) ?? 0) + 1);
  }

  return (
    <section className="card-surface space-y-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">客户旅程归因(多触点)</h2>
        <span className="text-xs text-muted-foreground">最近 {identities.length} 位客户</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">患者标识</th>
              <th className="px-4 py-2 font-medium">首次暗号</th>
              <th className="px-4 py-2 font-medium">触点数</th>
              <th className="px-4 py-2 font-medium">建立时间</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {identities.map((id) => (
              <tr key={id.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-mono">{id.patient_ref ?? '(未填)'}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{id.first_hook_value ?? '—'}</td>
                <td className="px-4 py-2.5">{tpCount.get(id.id) ?? 0}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {fmtDateTime(id.created_at)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/t/${tenantSlug}/attribution/journey/${id.id}`}
                    className="text-xs text-foreground hover:underline"
                  >
                    查看旅程 →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
