'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { fmtDateTime } from '@/lib/format';
import {
  createTestimonial,
  deleteTestimonial,
  setTestimonialCompliance,
  toggleTestimonialVisibility,
  updateTestimonial,
  type TestimonialInput,
} from './actions';

type Row = {
  id: string;
  author_pseudonym: string;
  body: string;
  rating: string | number | null;
  service_id: string | null;
  attested_at: string;
  compliance_status: 'pending' | 'approved' | 'rejected' | 'needs_review';
  geo_visible: boolean;
  updated_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待审',
  approved: '通过',
  rejected: '拒绝',
  needs_review: '复核',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  needs_review: 'bg-blue-100 text-blue-800',
};

const EMPTY: TestimonialInput & { id?: string } = {
  author_pseudonym: '',
  body: '',
  rating: null,
  service_id: null,
  attested_at: new Date().toISOString().slice(0, 10),
};

export function TestimonialsTable({
  tenantSlug,
  rows,
  services,
}: {
  tenantSlug: string;
  rows: Row[];
  services: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<(TestimonialInput & { id?: string }) | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setEdit({ ...EMPTY })}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background"
        >
          + 新增见证
        </button>
      </div>

      {edit && (
        <Form
          tenantSlug={tenantSlug}
          initial={edit}
          services={services}
          onClose={() => {
            setEdit(null);
            router.refresh();
          }}
        />
      )}

      {rows.length === 0 && !edit ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          还没有客户见证。建议从已成交客户里挑 5-10 位征求授权,匿名化后录入。
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-foreground">{r.author_pseudonym}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{r.attested_at.slice(0, 10)}</span>
                    {r.rating !== null && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{Number(r.rating).toFixed(1)}/5</span>
                      </>
                    )}
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.compliance_status] ?? 'bg-muted'}`}>
                      {STATUS_LABEL[r.compliance_status] ?? r.compliance_status}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{r.body}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex items-center gap-2">
                  {r.compliance_status === 'pending' && (
                    <>
                      <ComplianceButton
                        tenantSlug={tenantSlug}
                        id={r.id}
                        action="approved"
                        label="通过"
                        onDone={() => router.refresh()}
                      />
                      <ComplianceButton
                        tenantSlug={tenantSlug}
                        id={r.id}
                        action="rejected"
                        label="拒绝"
                        onDone={() => router.refresh()}
                      />
                    </>
                  )}
                  {r.compliance_status === 'approved' && (
                    <VisibilityToggle
                      tenantSlug={tenantSlug}
                      id={r.id}
                      visible={r.geo_visible}
                      onChange={() => router.refresh()}
                    />
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setEdit({
                        id: r.id,
                        author_pseudonym: r.author_pseudonym,
                        body: r.body,
                        rating: r.rating !== null ? Number(r.rating) : null,
                        service_id: r.service_id,
                        attested_at: r.attested_at.slice(0, 10),
                      })
                    }
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('删除这条见证?')) return;
                      try {
                        await deleteTestimonial(tenantSlug, r.id);
                        router.refresh();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : '失败');
                      }
                    }}
                    className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ComplianceButton({
  tenantSlug,
  id,
  action,
  label,
  onDone,
}: {
  tenantSlug: string;
  id: string;
  action: 'approved' | 'rejected';
  label: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await setTestimonialCompliance(tenantSlug, id, action);
            onDone();
          } catch (e) {
            alert(e instanceof Error ? e.message : '失败');
          }
        });
      }}
      className={`rounded-md px-3 py-1.5 text-xs font-medium ${
        action === 'approved'
          ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : 'border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
      } disabled:opacity-50`}
    >
      {pending ? '...' : label}
    </button>
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
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await toggleTestimonialVisibility(tenantSlug, id, !visible);
            onChange();
          } catch (e) {
            alert(e instanceof Error ? e.message : '失败');
          }
        });
      }}
      className={`rounded-full px-2 py-0.5 text-xs ${
        visible ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'
      } disabled:opacity-50`}
    >
      {visible ? '已公开' : '私有'}
    </button>
  );
}

function Form({
  tenantSlug,
  initial,
  services,
  onClose,
}: {
  tenantSlug: string;
  initial: TestimonialInput & { id?: string };
  services: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState(initial);

  const submit = () => {
    setErr(null);
    start(async () => {
      try {
        if (initial.id) await updateTestimonial(tenantSlug, initial.id, v);
        else await createTestimonial(tenantSlug, v);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">化名(不要写真名)*</span>
        <input
          className="form-input"
          value={v.author_pseudonym}
          onChange={(e) => setV({ ...v, author_pseudonym: e.target.value })}
          placeholder="L 女士 / 32 岁 / 南京"
          maxLength={80}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">见证内容 *</span>
        <textarea
          className="form-input min-h-[120px]"
          value={v.body}
          onChange={(e) => setV({ ...v, body: e.target.value })}
          maxLength={2000}
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">评分(1-5)</span>
          <input
            type="number"
            step="0.5"
            min="1"
            max="5"
            className="form-input"
            value={v.rating ?? ''}
            onChange={(e) => {
              const n = Number.parseFloat(e.target.value);
              setV({ ...v, rating: Number.isFinite(n) ? n : null });
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">关联服务(可选)</span>
          <select
            className="form-input"
            value={v.service_id ?? ''}
            onChange={(e) => setV({ ...v, service_id: e.target.value || null })}
          >
            <option value="">— 无 —</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">见证日期</span>
          <input
            type="date"
            className="form-input"
            value={v.attested_at}
            onChange={(e) => setV({ ...v, attested_at: e.target.value })}
          />
        </label>
      </div>

      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        💡 提示:创建后该条 testimonial 默认 <span className="font-mono">compliance_status=pending</span> 且
        <span className="font-mono"> geo_visible=false</span>。需要审过 + 显式开公开。
      </div>

      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      <div className="flex justify-end gap-2 pt-1">
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
          disabled={pending || !v.author_pseudonym.trim() || !v.body.trim()}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? '保存中…' : initial.id ? '保存' : '创建'}
        </button>
      </div>
    </div>
  );
}
