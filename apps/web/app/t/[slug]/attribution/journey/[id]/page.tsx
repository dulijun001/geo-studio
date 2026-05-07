/**
 * 客户旅程归因详情页 — 一位客户的完整接触链 + 3 模型并排对比.
 *
 * URL 参数 [id] = customer_identities.id.
 *
 * 面板结构:
 *   1. Header — 客户标识(patient_ref / fingerprint)
 *   2. 旅程时间线 — 所有 touchpoints 按时间排序
 *      每个触点显示:时间 / 平台 / 变体标题 / 员工
 *   3. 转化事件 — 该客户的所有 conversion_events(arrived/consulted/...)
 *   4. 三模型归因对比 — linear / time_decay / position_based 并排
 *      每个变体显示三个模型下分得的 credit 百分比
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantMember } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { fmtDateOnly, fmtDateTime } from '@/lib/format';
import {
  attributeAll,
  type AttributionModel,
  type Touchpoint,
} from '@geo/geo-core';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  arrived: '到店',
  consulted: '咨询',
  treated: '治疗',
  paid: '成交',
  lost: '流失',
};

const MODEL_LABEL: Record<AttributionModel, string> = {
  linear: '线性平均',
  time_decay: '时间衰减',
  position_based: '位置加权 (U)',
};

const MODEL_BLURB: Record<AttributionModel, string> = {
  linear: '所有触点平均分配 100%',
  time_decay: '越近成交的触点权重越高 (半衰期 7 天)',
  position_based: '首末各 40% + 中间 20% 平均',
};

type Identity = {
  id: string;
  patient_ref: string | null;
  client_fingerprint: string | null;
  first_hook_value: string | null;
  notes: string | null;
  created_at: string;
};

type TouchpointRow = {
  id: string;
  publish_task_id: string | null;
  touchpoint_type: string;
  touched_at: string;
  payload: Record<string, unknown> | null;
};

type ConversionRow = {
  id: string;
  stage: string;
  stage_at: string;
  amount_cents: number | null;
  notes: string | null;
};

type TaskMeta = {
  id: string;
  variant_id: string | null;
  staff_account_id: string | null;
  scheduled_at: string | null;
  variant?: { title: string; platform: string } | null;
  staff?: { real_name: string | null } | null;
};

export default async function JourneyDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const tenant = await requireTenantMember(params.slug);
  const supabase = createSupabaseServerClient();

  const { data: identity } = await supabase
    .from('customer_identities')
    .select('id, patient_ref, client_fingerprint, first_hook_value, notes, created_at')
    .eq('id', params.id)
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .maybeSingle<Identity>();
  if (!identity) notFound();

  // Touchpoints for this customer, oldest → newest (display order)
  const { data: tpsRaw } = await supabase
    .from('journey_touchpoints')
    .select('id, publish_task_id, touchpoint_type, touched_at, payload')
    .eq('identity_id', identity.id)
    .is('deleted_at', null)
    .order('touched_at', { ascending: true });
  const touchpoints = (tpsRaw ?? []) as TouchpointRow[];

  // Conversion events linked to this identity
  const { data: convsRaw } = await supabase
    .from('conversion_events')
    .select('id, stage, stage_at, amount_cents, notes')
    .eq('identity_id', identity.id)
    .is('deleted_at', null)
    .order('stage_at', { ascending: true });
  const conversions = (convsRaw ?? []) as ConversionRow[];

  // Hydrate publish_task → variant + staff for human-readable labels.
  const taskIds = Array.from(
    new Set(touchpoints.map((tp) => tp.publish_task_id).filter((id): id is string => !!id)),
  );
  const taskMeta = new Map<string, TaskMeta>();
  if (taskIds.length > 0) {
    const { data: tasksRaw } = await supabase
      .from('publish_tasks')
      .select('id, variant_id, staff_account_id, scheduled_at')
      .in('id', taskIds);
    type T = { id: string; variant_id: string | null; staff_account_id: string | null; scheduled_at: string | null };
    const tasks = (tasksRaw ?? []) as T[];
    const variantIds = Array.from(new Set(tasks.map((t) => t.variant_id).filter((id): id is string => !!id)));
    const staffIds = Array.from(new Set(tasks.map((t) => t.staff_account_id).filter((id): id is string => !!id)));
    const [{ data: vsRaw }, { data: ssRaw }] = await Promise.all([
      variantIds.length
        ? supabase.from('content_variants').select('id, title, platform').in('id', variantIds)
        : Promise.resolve({ data: [] }),
      staffIds.length
        ? supabase.from('staff_accounts').select('id, real_name').in('id', staffIds)
        : Promise.resolve({ data: [] }),
    ]);
    const vById = new Map((vsRaw ?? []).map((v) => [v.id as string, v as { id: string; title: string; platform: string }]));
    const sById = new Map((ssRaw ?? []).map((s) => [s.id as string, s as { id: string; real_name: string | null }]));
    for (const t of tasks) {
      taskMeta.set(t.id, {
        ...t,
        variant: t.variant_id ? vById.get(t.variant_id) ?? null : null,
        staff: t.staff_account_id ? sById.get(t.staff_account_id) ?? null : null,
      });
    }
  }

  // Pick the latest "成交" or fallback to latest conversion as the anchor
  // for time_decay; if none, use now.
  const anchorConv = conversions.find((c) => c.stage === 'paid')
    ?? conversions[conversions.length - 1];
  const conversionAt = anchorConv ? new Date(anchorConv.stage_at) : new Date();

  // Run all 3 attribution models
  const tpInputs: Touchpoint[] = touchpoints.map((tp) => ({
    id: tp.id,
    publish_task_id: tp.publish_task_id,
    touched_at: new Date(tp.touched_at),
  }));
  const allModels = attributeAll(tpInputs, conversionAt);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/t/${tenant.slug}/attribution`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← 返回归因总览
        </Link>
      </div>

      <PageHeader
        title="客户旅程归因详情"
        subtitle={`${touchpoints.length} 个触点 · ${conversions.length} 个转化事件 · 同时跑 3 种归因模型对比`}
      />

      {/* 客户标识 */}
      <section className="card-surface p-5">
        <h2 className="mb-3 text-sm font-medium">客户标识</h2>
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <KV label="患者标识" value={identity.patient_ref ?? '(未填)'} />
          <KV label="设备指纹" value={identity.client_fingerprint?.slice(0, 16) ?? '(无)'} />
          <KV label="首次暗号" value={identity.first_hook_value ?? '(无)'} />
        </div>
        {identity.notes && (
          <p className="mt-3 rounded-sm bg-muted/30 p-2 text-xs text-muted-foreground">{identity.notes}</p>
        )}
      </section>

      {/* 旅程时间线 */}
      <section className="card-surface p-5">
        <h2 className="mb-3 text-sm font-medium">接触时间线({touchpoints.length} 个触点)</h2>
        {touchpoints.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
            该客户暂无触点记录。/c/[slug]/checkin 着陆页提交时会自动记录。
          </p>
        ) : (
          <ol className="space-y-2">
            {touchpoints.map((tp, idx) => {
              const t = tp.publish_task_id ? taskMeta.get(tp.publish_task_id) : null;
              return (
                <li key={tp.id} className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-xs">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                    {idx + 1}
                  </span>
                  <div className="flex-1 space-y-0.5">
                    <p className="font-medium">
                      {t?.variant?.title ?? '(变体已删除)'}
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t?.variant?.platform ?? '?'}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      {tp.touchpoint_type} · {fmtDateTime(tp.touched_at)}
                      {t?.staff?.real_name && ` · 由 ${t.staff.real_name} 发布`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* 转化事件 */}
      <section className="card-surface p-5">
        <h2 className="mb-3 text-sm font-medium">转化事件({conversions.length})</h2>
        {conversions.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
            尚未记录转化事件。
          </p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {conversions.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <span className="rounded-full bg-emerald-500/[0.12] px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  {STAGE_LABEL[c.stage] ?? c.stage}
                </span>
                <span className="text-muted-foreground">{fmtDateTime(c.stage_at)}</span>
                {c.amount_cents != null && c.amount_cents > 0 && (
                  <span className="font-mono">¥{(c.amount_cents / 100).toLocaleString()}</span>
                )}
                {c.notes && <span className="text-muted-foreground">{c.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 三模型归因对比 */}
      {touchpoints.length > 0 && (
        <section className="card-surface p-5">
          <h2 className="mb-3 text-sm font-medium">三模型归因对比</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            归因锚定时间 = {anchorConv ? `${STAGE_LABEL[anchorConv.stage] ?? anchorConv.stage} (${fmtDateTime(anchorConv.stage_at)})` : '当前时间(无成交事件)'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2 font-normal">触点</th>
                  {(['linear', 'time_decay', 'position_based'] as AttributionModel[]).map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-normal">
                      <div>{MODEL_LABEL[m]}</div>
                      <div className="text-[10px] opacity-70">{MODEL_BLURB[m]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {touchpoints.map((tp, idx) => {
                  const t = tp.publish_task_id ? taskMeta.get(tp.publish_task_id) : null;
                  const ti = tpInputs.findIndex((x) => x.id === tp.id);
                  return (
                    <tr key={tp.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-2 py-2">
                        <div className="font-medium">
                          {idx + 1}. {t?.variant?.title?.slice(0, 30) ?? '(已删)'}
                          {(t?.variant?.title?.length ?? 0) > 30 ? '…' : ''}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t?.variant?.platform ?? '?'} · {fmtDateOnly(tp.touched_at)}
                        </div>
                      </td>
                      {(['linear', 'time_decay', 'position_based'] as AttributionModel[]).map((m) => {
                        const credit = allModels[m].credits[ti]?.credit ?? 0;
                        const pct = (credit * 100).toFixed(1);
                        return (
                          <td key={m} className="px-2 py-2 text-right">
                            <div className="font-mono font-medium">{pct}%</div>
                            <div className="mt-1 h-1 w-full rounded-full bg-muted">
                              <div
                                className="h-1 rounded-full bg-foreground"
                                style={{ width: `${Math.min(100, credit * 100)}%` }}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            三个模型给出三个版本的"哪条内容贡献最大"。运营选择哪个模型本质是哲学选择,
            没有客观正确答案 — 看你想奖励"开端发现品牌的内容"还是"关单的最后一击"。
          </p>
        </section>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
