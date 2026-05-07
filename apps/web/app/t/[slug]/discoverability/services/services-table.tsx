'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteService, toggleServiceVisibility } from './actions';
import { EMPTY_SERVICE, ServiceForm, type ServiceFormInitial } from './service-form';

type Row = {
  id: string;
  name: string;
  category: string | null;
  description_md: string | null;
  duration_minutes: number | null;
  price_range: Record<string, unknown> | null;
  medical_procedure_code: string | null;
  geo_visible: boolean;
  created_at: string;
  updated_at: string;
};

export function ServicesTable({
  tenantSlug,
  rows,
}: {
  tenantSlug: string;
  rows: Row[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<ServiceFormInitial | null>(null);

  const openNew = () => setEdit({ ...EMPTY_SERVICE });
  const openEdit = (r: Row) =>
    setEdit({
      id: r.id,
      name: r.name,
      description_md: r.description_md ?? '',
      category: r.category ?? '',
      duration_minutes: r.duration_minutes,
      price_min: numFromRange(r.price_range, 'min'),
      price_max: numFromRange(r.price_range, 'max'),
      price_typical: numFromRange(r.price_range, 'typical'),
      procedure_code: r.medical_procedure_code ?? '',
      geo_visible: r.geo_visible,
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          创建后的服务默认 <span className="font-mono">geo_visible=false</span>(不公开)。审过内容后再勾上。
        </p>
        <button
          type="button"
          onClick={openNew}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background"
        >
          + 新增服务
        </button>
      </div>

      {edit && (
        <ServiceForm
          tenantSlug={tenantSlug}
          initial={edit}
          onClose={() => setEdit(null)}
        />
      )}

      {rows.length === 0 && !edit ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          还没有服务记录。点上方"新增服务"开始。
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">分类</th>
                <th className="px-4 py-2 font-medium">价格</th>
                <th className="px-4 py-2 font-medium">代码</th>
                <th className="px-4 py-2 font-medium">公开</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.category ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtPrice(r.price_range)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.medical_procedure_code ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <VisibilityToggle
                      tenantSlug={tenantSlug}
                      id={r.id}
                      visible={r.geo_visible}
                      onChange={() => router.refresh()}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
                      >
                        编辑
                      </button>
                      <DeleteButton
                        tenantSlug={tenantSlug}
                        id={r.id}
                        name={r.name}
                        onDeleted={() => router.refresh()}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VisibilityToggle({
  tenantSlug,
  id,
  visible,
  onChange,
}: {
  tenantSlug: string;
  id: string;
  visible: boolean;
  onChange: () => void;
}) {
  const [pending, start] = useTransition();
  const onClick = () => {
    start(async () => {
      try {
        await toggleServiceVisibility(tenantSlug, id, !visible);
        onChange();
      } catch (e) {
        console.error(e);
      }
    });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`rounded-full px-2 py-0.5 text-xs ${
        visible
          ? 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {visible ? '公开' : '私有'}
    </button>
  );
}

function DeleteButton({
  tenantSlug,
  id,
  name,
  onDeleted,
}: {
  tenantSlug: string;
  id: string;
  name: string;
  onDeleted: () => void;
}) {
  const [pending, start] = useTransition();
  const onClick = () => {
    if (!confirm(`确认删除"${name}"?`)) return;
    start(async () => {
      try {
        await deleteService(tenantSlug, id);
        onDeleted();
      } catch (e) {
        alert(e instanceof Error ? e.message : '删除失败');
      }
    });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/[0.10] disabled:opacity-50"
    >
      删除
    </button>
  );
}

function numFromRange(p: Record<string, unknown> | null, key: string): number | null {
  if (!p) return null;
  const v = p[key];
  return typeof v === 'number' ? v : null;
}

function fmtPrice(p: Record<string, unknown> | null): string {
  if (!p) return '—';
  const min = typeof p.min === 'number' ? p.min : null;
  const max = typeof p.max === 'number' ? p.max : null;
  const typ = typeof p.typical === 'number' ? p.typical : null;
  if (min !== null && max !== null) return `¥${min.toLocaleString()}–${max.toLocaleString()}`;
  if (typ !== null) return `¥${typ.toLocaleString()}`;
  if (min !== null) return `from ¥${min.toLocaleString()}`;
  return '—';
}
