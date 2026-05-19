'use client';

import { useState, useTransition } from 'react';
import { saveManualSlots, type ManualSlotInput } from './actions';

type PlatformOption = { value: string; label: string };

export function ManualSlotsEditor({
  tenantSlug,
  cap,
  initial,
  platforms,
}: {
  tenantSlug: string;
  cap: number;
  initial: ManualSlotInput[];
  platforms: readonly PlatformOption[];
}) {
  const [rows, setRows] = useState<ManualSlotInput[]>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const addRow = () => {
    if (rows.length >= cap) {
      setFeedback(`✗ 最多 ${cap} 个手填位,在「每日自动化」设置里调高`);
      return;
    }
    setRows([...rows, { topic: '', audience: '', platforms: [] }]);
    setFeedback(null);
  };

  const updateRow = (idx: number, patch: Partial<ManualSlotInput>) => {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setFeedback(null);
  };

  const removeRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx));
    setFeedback(null);
  };

  const togglePlatform = (idx: number, platform: string) => {
    const row = rows[idx];
    if (!row) return;
    const has = row.platforms.includes(platform);
    updateRow(idx, {
      platforms: has
        ? row.platforms.filter((p) => p !== platform)
        : [...row.platforms, platform],
    });
  };

  const submit = () => {
    setFeedback(null);
    startTransition(async () => {
      const r = await saveManualSlots(tenantSlug, rows);
      if (r.ok) setFeedback(`✓ 已保存 ${r.saved} 个手填位`);
      else setFeedback(`✗ ${r.error}`);
    });
  };

  return (
    <section className="space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
          还没有手填位。<button
            type="button"
            onClick={addRow}
            className="ml-1 text-foreground underline"
          >
            添加一个
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, idx) => (
            <li
              key={idx}
              className="rounded-lg border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="text-xs text-rose-400 hover:underline"
                >
                  删除
                </button>
              </div>

              <Field label="题目" hint="至少 2 字,会作为 AI 起草的 topic">
                <input
                  type="text"
                  value={row.topic}
                  onChange={(e) => updateRow(idx, { topic: e.target.value })}
                  placeholder="例如:种植牙 5 年存活率"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </Field>

              <Field label="受众" hint="例如:30-45 岁缺牙人群">
                <input
                  type="text"
                  value={row.audience}
                  onChange={(e) => updateRow(idx, { audience: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </Field>

              <Field label="平台" hint="至少选 1 个,每平台一条变体">
                <div className="flex flex-wrap gap-2">
                  {platforms.map((p) => {
                    const on = row.platforms.includes(p.value);
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => togglePlatform(idx, p.value)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          on
                            ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border border-border bg-background text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= cap}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
        >
          + 添加一个({rows.length}/{cap})
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md border border-foreground/20 bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? '保存中…' : '保存'}
        </button>
        {feedback && (
          <p
            className={`text-xs ${feedback.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            {feedback}
          </p>
        )}
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
