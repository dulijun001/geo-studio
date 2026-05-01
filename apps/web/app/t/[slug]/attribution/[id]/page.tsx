import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  arrived: '到店',
  consulted: '咨询',
  treated: '治疗',
  paid: '付款',
  lost: '流失',
};

export default async function ConversionDetail({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator', 'auditor']);
  const supabase = createSupabaseServerClient();

  // Two-step: events → hook → publish_task → staff + variant → content_item.
  const { data: ev } = await supabase
    .from('conversion_events')
    .select('id, hook_id, stage, stage_at, amount_cents, notes, created_at')
    .eq('id', params.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!ev) notFound();

  type Hook = {
    id: string;
    hook_type: string;
    hook_value: string;
    publish_task_id: string;
    valid_until: string | null;
  };
  type Task = {
    id: string;
    variant_id: string;
    staff_account_id: string;
    status: string;
    created_at: string;
    dispatched_at: string | null;
    scheduled_at: string | null;
    published_at: string | null;
    published_url: string | null;
  };
  let hook: Hook | null = null;
  if (ev.hook_id) {
    const { data } = await supabase
      .from('hooks')
      .select('id, hook_type, hook_value, publish_task_id, valid_until')
      .eq('id', ev.hook_id)
      .maybeSingle();
    hook = (data as Hook | null) ?? null;
  }
  let task: Task | null = null;
  if (hook) {
    const { data } = await supabase
      .from('publish_tasks')
      .select('id, variant_id, staff_account_id, status, created_at, dispatched_at, scheduled_at, published_at, published_url')
      .eq('id', hook.publish_task_id)
      .maybeSingle();
    task = (data as Task | null) ?? null;
  }

  const [variantRes, staffRes] = await Promise.all([
    task
      ? supabase
          .from('content_variants')
          .select('id, title, body, platform, content_item_id, created_at')
          .eq('id', task.variant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    task
      ? supabase
          .from('staff_accounts')
          .select('id, real_name, phone, role')
          .eq('id', task.staff_account_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  type Variant = {
    id: string;
    title: string;
    body: string;
    platform: string;
    content_item_id: string;
    created_at: string;
  };
  type Staff = { id: string; real_name: string; phone: string | null; role: string };
  const variant = (variantRes.data as Variant | null) ?? null;
  const staff = (staffRes.data as Staff | null) ?? null;

  const { data: contentItem } = variant
    ? await supabase
        .from('content_items')
        .select('id, title, source_type, created_at')
        .eq('id', variant.content_item_id)
        .maybeSingle()
    : { data: null };
  type Content = { id: string; title: string; source_type: string; created_at: string };
  const ci = (contentItem as Content | null) ?? null;

  // Timeline events in chronological order.
  type TimelineItem = { ts: string; label: string; detail: string };
  const timeline: TimelineItem[] = [];
  if (ci) {
    timeline.push({
      ts: ci.created_at,
      label: '原始素材入库',
      detail: `${ci.source_type} · ${ci.title}`,
    });
  }
  if (variant) {
    timeline.push({
      ts: variant.created_at,
      label: '变体生成',
      detail: `${variant.platform} · ${variant.title}`,
    });
  }
  if (task) {
    timeline.push({
      ts: task.created_at,
      label: '派单',
      detail: `分配给 ${staff?.real_name ?? '?'}`,
    });
    if (task.published_at) {
      timeline.push({
        ts: task.published_at,
        label: '员工发布',
        detail: task.published_url ?? '链接缺失',
      });
    }
  }
  timeline.push({
    ts: ev.stage_at,
    label: `患者${STAGE_LABEL[ev.stage] ?? ev.stage}`,
    detail: ev.notes ?? '通过暗号 / 医生名归因',
  });
  timeline.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <div className="space-y-6">
      <PageHeader
        title="转化事件溯源"
        subtitle={`从原始素材到患者${STAGE_LABEL[ev.stage] ?? ev.stage}的完整链路`}
        actions={
          <Link
            href={`/t/${tenant.slug}/attribution`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ← 返回归因看板
          </Link>
        }
      />

      <section className="card-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">事件本身</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">阶段</dt>
          <dd className="font-medium">{STAGE_LABEL[ev.stage] ?? ev.stage}</dd>
          <dt className="text-muted-foreground">登记时间</dt>
          <dd>{fmtDateTime(ev.stage_at)}</dd>
          {ev.notes ? (
            <>
              <dt className="text-muted-foreground">备注</dt>
              <dd>{ev.notes}</dd>
            </>
          ) : null}
          {ev.amount_cents ? (
            <>
              <dt className="text-muted-foreground">金额</dt>
              <dd>¥ {(Number(ev.amount_cents) / 100).toFixed(2)}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <div className="grid gap-6 md:grid-cols-[1fr,260px]">
        <section className="card-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">完整链路时间线</h2>
          <ol className="relative space-y-5 border-l border-border pl-6">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-1 flex h-3 w-3 items-center justify-center rounded-full gradient-brand ring-4 ring-background" />
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(t.ts)} · {t.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-4">
          {hook ? (
            <Card title="钩子">
              <p className="font-mono text-sm">{hook.hook_value}</p>
              <p className="text-xs text-muted-foreground">{hook.hook_type}</p>
            </Card>
          ) : null}
          {staff ? (
            <Card title="员工">
              <p className="text-sm font-medium">{staff.real_name}</p>
              {staff.phone ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {staff.phone.length === 11
                    ? `${staff.phone.slice(0, 3)}****${staff.phone.slice(-4)}`
                    : staff.phone}
                </p>
              ) : null}
            </Card>
          ) : null}
          {variant ? (
            <Card title="变体">
              <Link
                href={`/t/${tenant.slug}/compliance/${variant.id}`}
                className="line-clamp-2 text-sm font-medium hover:underline"
              >
                {variant.title}
              </Link>
              <p className="text-[11px] text-muted-foreground">
                {variant.platform.replace(/_/g, ' ')}
              </p>
            </Card>
          ) : null}
          {ci ? (
            <Card title="原始素材">
              <Link
                href={`/t/${tenant.slug}/content/${ci.id}`}
                className="line-clamp-2 text-sm font-medium hover:underline"
              >
                {ci.title}
              </Link>
              <p className="text-[11px] text-muted-foreground">{ci.source_type}</p>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface p-4">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
