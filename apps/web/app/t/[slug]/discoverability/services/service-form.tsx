'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createService, updateService } from './actions';

export type ServiceFormInitial = {
  id?: string;
  name: string;
  description_md: string;
  category: string;
  duration_minutes: number | null;
  price_min: number | null;
  price_max: number | null;
  price_typical: number | null;
  procedure_code: string;
  geo_visible: boolean;
};

export const EMPTY_SERVICE: ServiceFormInitial = {
  name: '',
  description_md: '',
  category: '',
  duration_minutes: null,
  price_min: null,
  price_max: null,
  price_typical: null,
  procedure_code: '',
  geo_visible: false,
};

export function ServiceForm({
  tenantSlug,
  initial,
  onClose,
}: {
  tenantSlug: string;
  initial: ServiceFormInitial;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState(initial);

  const submit = () => {
    setErr(null);
    start(async () => {
      try {
        if (initial.id) {
          await updateService(tenantSlug, initial.id, v);
        } else {
          await createService(tenantSlug, v);
        }
        router.refresh();
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <Field label="服务名 *">
        <input
          className="form-input"
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          placeholder="例:集采种植牙"
          maxLength={100}
        />
      </Field>
      <Field label="分类">
        <input
          className="form-input"
          value={v.category}
          onChange={(e) => setV({ ...v, category: e.target.value })}
          placeholder="例:种植 / 正畸 / 儿牙"
        />
      </Field>
      <Field label="医疗过程代码">
        <input
          className="form-input"
          value={v.procedure_code}
          onChange={(e) => setV({ ...v, procedure_code: e.target.value })}
          placeholder="例:DENTAL_IMPLANT(留空 = fallback Service 而非 MedicalProcedure)"
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="价格区间下限 (¥)">
          <input
            type="number"
            className="form-input"
            value={v.price_min ?? ''}
            onChange={(e) => setV({ ...v, price_min: numericOrNull(e.target.value) })}
          />
        </Field>
        <Field label="典型价 (¥)">
          <input
            type="number"
            className="form-input"
            value={v.price_typical ?? ''}
            onChange={(e) => setV({ ...v, price_typical: numericOrNull(e.target.value) })}
          />
        </Field>
        <Field label="上限 (¥)">
          <input
            type="number"
            className="form-input"
            value={v.price_max ?? ''}
            onChange={(e) => setV({ ...v, price_max: numericOrNull(e.target.value) })}
          />
        </Field>
      </div>
      <Field label="估计耗时(分钟)">
        <input
          type="number"
          className="form-input"
          value={v.duration_minutes ?? ''}
          onChange={(e) => setV({ ...v, duration_minutes: numericOrNull(e.target.value) })}
        />
      </Field>
      <Field label="详细描述(markdown)">
        <textarea
          className="form-input min-h-[100px]"
          value={v.description_md}
          onChange={(e) => setV({ ...v, description_md: e.target.value })}
          placeholder="服务简介、流程、适合人群、效果范围..."
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.geo_visible}
          onChange={(e) => setV({ ...v, geo_visible: e.target.checked })}
        />
        公开 — 创建后立即出现在 schema / llms.txt / feed
      </label>

      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !v.name.trim()}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? '保存中…' : initial.id ? '保存' : '创建'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function numericOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
