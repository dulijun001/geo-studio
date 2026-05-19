'use client';

import { useState, useTransition } from 'react';
import { updateDailyOpsSettings, type DailyOpsSettingsInput } from './actions';

type Initial = DailyOpsSettingsInput;

const TIMEOUT_OPTIONS = [2, 4, 6, 8, 12, 24] as const;

export function DailyOpsSettingsForm({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: Initial;
}) {
  const [form, setForm] = useState<Initial>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => {
    setForm((s) => ({ ...s, [k]: v }));
    setFeedback(null);
  };

  const submit = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateDailyOpsSettings(tenantSlug, form);
      if (result.ok) setFeedback('✓ 已保存');
      else setFeedback(`✗ ${result.error}`);
    });
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      {/* enabled toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <label className="text-sm font-medium" htmlFor="enabled">
            总开关
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            关闭时凌晨 cron 跳过这个 tenant,不消耗任何资源。
          </p>
        </div>
        <button
          id="enabled"
          type="button"
          onClick={() => set('enabled', !form.enabled)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            form.enabled
              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border border-border bg-background text-muted-foreground'
          }`}
        >
          {form.enabled ? '已启用' : '已关闭'}
        </button>
      </div>

      <hr className="border-border" />

      {/* Selection */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="自动选题数"
          hint="0-15,默认 5。从问题库按优先级 + 新鲜度抽。"
        >
          <input
            type="number"
            min={0}
            max={15}
            value={form.topic_count_auto}
            onChange={(e) => set('topic_count_auto', Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </Field>
        <Field
          label="手填位数"
          hint="0-5,默认 2。预留给你每天手动指定的题。"
        >
          <input
            type="number"
            min={0}
            max={5}
            value={form.manual_slot_max}
            onChange={(e) => set('manual_slot_max', Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </Field>
      </div>

      {/* Timeout + max_variants_day */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="审核超时"
          hint="超过这个时长未审,系统默认放行绿色变体(异常仍 stay)。"
        >
          <select
            value={form.timeout_hours}
            onChange={(e) => set('timeout_hours', Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {TIMEOUT_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h} 小时
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="每日变体上限"
          hint="5-200,默认 50。防员工矩阵被淹,超过会 spill 到次日。"
        >
          <input
            type="number"
            min={5}
            max={200}
            value={form.max_variants_day}
            onChange={(e) => set('max_variants_day', Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </Field>
      </div>

      {/* weekend skip */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <label className="text-sm font-medium" htmlFor="weekend">
            周末跳过
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            打开后周六周日凌晨 cron 不跑。员工和你都能歇。
          </p>
        </div>
        <button
          id="weekend"
          type="button"
          onClick={() => set('weekend_skip', !form.weekend_skip)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            form.weekend_skip
              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border border-border bg-background text-muted-foreground'
          }`}
        >
          {form.weekend_skip ? '跳过' : '正常跑'}
        </button>
      </div>

      {/* notify email */}
      <Field
        label="通知邮箱"
        hint="留空 = 用 tenant owner 邮箱。每日 9:00 收到待审通知。"
      >
        <input
          type="email"
          placeholder="例如 admin@example.com"
          value={form.notify_email ?? ''}
          onChange={(e) => set('notify_email', e.target.value || null)}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </Field>

      <hr className="border-border" />

      {/* submit */}
      <div className="flex items-center justify-end gap-3">
        {feedback && (
          <p
            className={`text-xs ${feedback.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            {feedback}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md border border-foreground/20 bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
