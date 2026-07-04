/**
 * V1.10 /daily-ops Hub — "今日待审" tab 内容.
 *
 * Extracted from app/t/[slug]/today/page.tsx into a non-page server component
 * so the Hub page.tsx can include it conditionally.
 */
import Link from 'next/link';
import {
  classifyVariant,
  countByClass,
  type ReadinessClass,
  type VariantReadinessInput,
} from '@geo/geo-core';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { BulkApproveButton } from '../today/bulk-approve-button';

type VariantRow = {
  id: string;
  title: string;
  platform: string;
  status: string;
  dod_status: string | null;
  dod_score: number | null;
  compliance_status: string | null;
  auto_rewrite_count: number | null;
  numeric_check: { verdict?: string } | null;
};

type RunRow = {
  id: string;
  run_date: string;
  status: string;
  notified_at: string | null;
  drafted_at: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  counts: Record<string, number> | null;
};

const STATUS_LABELS: Record<string, string> = {
  picking_topics: '凌晨在跑(选题中)',
  drafting: '凌晨在跑(AI 起草中)',
  evaluating: '正在评估 DoD + 合规',
  awaiting_review: '等你来审',
  auto_dispatched_partial: '超时已放行绿色,等你派单',
  awaiting_manual: '等你来审(无可自动放行)',
  completed: '今日已完成',
  failed: '运行失败',
};

const CLASS_META: Record<
  ReadinessClass,
  { label: string; dot: string; tagBg: string; desc: string }
> = {
  green: {
    label: '🟢 默认通过',
    dot: 'bg-emerald-500',
    tagBg: 'bg-emerald-500/10 text-emerald-400',
    desc: 'DoD 通过 + 合规自动批准 + 0 次改写 + 数值核对 OK',
  },
  yellow: {
    label: '🟡 软异常',
    dot: 'bg-amber-500',
    tagBg: 'bg-amber-500/10 text-amber-400',
    desc: '已被 auto-rewrite 改过 或 数值核对警告',
  },
  red: {
    label: '🔴 合规拒绝',
    dot: 'bg-rose-500',
    tagBg: 'bg-rose-500/10 text-rose-400',
    desc: '合规四道门触发,需你判定是否手动覆盖',
  },
  black: {
    label: '⚫ DoD 不过',
    dot: 'bg-zinc-500',
    tagBg: 'bg-zinc-500/10 text-zinc-400',
    desc: '内容结构 / 引用 / FAQ 不达 D21 质量门',
  },
};

export async function TodayView({
  slug,
  tenantId,
}: {
  slug: string;
  tenantId: string;
}) {
  const service = getSupabaseServiceClient();

  const { data: run } = await service
    .from('daily_ops_runs')
    .select(
      'id, run_date, status, notified_at, drafted_at, reviewed_at, completed_at, failure_reason, counts',
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return <EmptyState slug={slug} />;

  const typedRun = run as RunRow;

  const { data: rawVariants } = await service
    .from('content_variants')
    .select(
      'id, title, platform, status, dod_status, dod_score, compliance_status, auto_rewrite_count, numeric_check',
    )
    .eq('daily_run_id', typedRun.id)
    // T0b 2026-05-19 + V1.10.4 2026-05-20: surface every variant in this
    // run that still belongs in the 4-bucket view. V1.9 cascade promotes:
    //   draft → pending_review (needs human) → auto_approved / manual_approved
    //                                       → rejected
    // We hide only the truly downstream states (dispatched / published) and
    // 'archived' (operator已 trash). Earlier T0b filter omitted manual_approved
    // and rejected — that hid 7/10 variants from /today after the operator或
    // upstream review flow had already acted on them.
    .in('status', ['draft', 'pending_review', 'auto_approved', 'manual_approved', 'rejected'])
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const variants = (rawVariants ?? []) as VariantRow[];

  const buckets: Record<ReadinessClass, VariantRow[]> = {
    green: [],
    yellow: [],
    red: [],
    black: [],
  };

  for (const v of variants) {
    const input: VariantReadinessInput = {
      dod_status: (v.dod_status ?? 'unknown') as VariantReadinessInput['dod_status'],
      compliance_status: (v.compliance_status ?? 'pending') as string,
      auto_rewrite_count: (v.auto_rewrite_count ?? 0) as number,
      numeric_check: v.numeric_check,
    };
    buckets[classifyVariant(input)].push(v);
  }
  const counts = countByClass(
    variants.map((v) => ({
      dod_status: (v.dod_status ?? 'unknown') as VariantReadinessInput['dod_status'],
      compliance_status: (v.compliance_status ?? 'pending') as string,
      auto_rewrite_count: (v.auto_rewrite_count ?? 0) as number,
      numeric_check: v.numeric_check,
    })),
  );

  const timeoutInfo = computeTimeoutDisplay(typedRun);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {typedRun.run_date} · {STATUS_LABELS[typedRun.status] ?? typedRun.status}
        </p>
        {timeoutInfo && (
          <p className="text-sm text-muted-foreground">{timeoutInfo}</p>
        )}
        {typedRun.failure_reason && (
          <FailureBanner reason={typedRun.failure_reason} />
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(['green', 'yellow', 'red', 'black'] as ReadinessClass[]).map((k) => (
          <div key={k} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${CLASS_META[k].dot}`} />
              {CLASS_META[k].label}
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{counts[k]}</p>
            <p className="mt-1 text-xs text-muted-foreground">{CLASS_META[k].desc}</p>
          </div>
        ))}
      </section>

      {counts.green > 0 && (
        <BulkApproveButton tenantSlug={slug} greenCount={counts.green} />
      )}

      {(['green', 'yellow', 'red', 'black'] as ReadinessClass[]).map((k) => (
        <VariantSection key={k} slug={slug} klass={k} variants={buckets[k]} />
      ))}
    </div>
  );
}

function VariantSection({
  slug,
  klass,
  variants,
}: {
  slug: string;
  klass: ReadinessClass;
  variants: VariantRow[];
}) {
  if (variants.length === 0) return null;
  const meta = CLASS_META[klass];
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label} <span className="text-muted-foreground">· {variants.length}</span>
        </h2>
      </header>
      <ul className="divide-y divide-border">
        {variants.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{v.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className={`mr-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${meta.tagBg}`}>
                  {v.platform}
                </span>
                {v.dod_score != null && `DoD ${v.dod_score} · `}
                {v.compliance_status === 'rejected' && '合规拒 · '}
                {(v.auto_rewrite_count ?? 0) > 0 &&
                  `已 auto-rewrite ${v.auto_rewrite_count}× · `}
                {v.numeric_check?.verdict === 'warn' && '数值警告 · '}
                {v.numeric_check?.verdict === 'reject' && '数值不一致 · '}
              </p>
            </div>
            <Link
              href={`/t/${slug}/compliance/${v.id}`}
              className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
            >
              {klass === 'green' ? '查看' : '审'}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ slug }: { slug: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-sm">
      <p className="font-medium">还没有 daily-ops 运行记录</p>
      <p className="mt-2 text-muted-foreground">
        凌晨 02:00 cron 还没跑过,或这个 tenant 没启用 daily-ops。前往{' '}
        <Link
          href={`/t/${slug}/daily-ops?tab=settings`}
          className="text-foreground underline"
        >
          设置 tab
        </Link>{' '}
        打开后,明日凌晨即可看到第一份 run。
      </p>
    </div>
  );
}

function computeTimeoutDisplay(run: RunRow): string | null {
  if (run.status !== 'awaiting_review' || !run.notified_at) return null;
  const notifiedMs = new Date(run.notified_at).getTime();
  const elapsedMin = Math.floor((Date.now() - notifiedMs) / 60_000);
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  return `审核窗口已开启 ${h}h ${m}m(超时后绿色将自动放行)`;
}

/**
 * 失败横幅人话化(docs/12 P0-2,2026-07-04)。此前直接输出英文技术日志
 * ("batch finished with 0 successful items…")给客户,违反「反馈引导行动」。
 * 已知失败模式翻译成人话 + 给下一步动作;原始报错收进折叠不丢失。
 */
function FailureBanner({ reason }: { reason: string }) {
  let headline = '今日自动起草失败';
  let action = '系统会在下次运行时自动重试;若持续失败,请把下方技术详情发给技术支持。';
  if (/overdue|欠费/i.test(reason)) {
    headline = '火山方舟账户欠费,AI 生成暂停';
    action = '请到火山方舟控制台(费用中心)充值。充值后无需其他操作:失败任务会自动重试,今晚定时任务也会正常运行。';
  } else if (/0 successful|\d+\/\d+ failed/.test(reason)) {
    headline = '今日起草全部失败';
    action = '常见原因是 AI 账户欠费或服务波动。可到「内容 → 批量起草」页对失败项逐条重试,或等今晚定时任务自动重跑。';
  } else if (/timeout|timed out|超时/i.test(reason)) {
    headline = 'AI 服务响应超时';
    action = '一般是临时波动,系统会自动重试,无需操作。';
  }
  return (
    <div className="space-y-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
      <p className="text-sm font-semibold text-rose-300">⚠️ {headline}</p>
      <p className="text-sm leading-relaxed text-rose-200/90">{action}</p>
      <details className="text-xs text-rose-300/60">
        <summary className="cursor-pointer select-none">技术详情</summary>
        <p className="mt-1 break-all font-mono">{reason}</p>
      </details>
    </div>
  );
}
