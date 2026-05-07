'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createFaq, deleteFaq, toggleFaqVisibility, updateFaq, type FaqInput } from './actions';

type Row = {
  id: string;
  question: string;
  answer_md: string;
  category: string | null;
  sort_order: number;
  geo_visible: boolean;
  updated_at: string;
};

const EMPTY: FaqInput & { id?: string } = {
  question: '',
  answer_md: '',
  category: '',
  sort_order: 0,
  geo_visible: true,
};

export function FaqsTable({ tenantSlug, rows }: { tenantSlug: string; rows: Row[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<(FaqInput & { id?: string }) | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">FAQ 默认 geo_visible=true(问答属于公开内容)。</p>
        <button
          type="button"
          onClick={() => setEdit({ ...EMPTY })}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background"
        >
          + 新增 FAQ
        </button>
      </div>

      {edit && (
        <FaqForm
          tenantSlug={tenantSlug}
          initial={edit}
          onClose={() => {
            setEdit(null);
            router.refresh();
          }}
        />
      )}

      {rows.length === 0 && !edit ? (
        <Empty />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-card">
              <div className="flex items-start justify-between gap-3 p-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {r.category && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.category}</span>
                    )}
                    <span className="font-medium">{r.question}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.answer_md}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await toggleFaqVisibility(tenantSlug, r.id, !r.geo_visible);
                        router.refresh();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : '失败');
                      }
                    }}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      r.geo_visible ? 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {r.geo_visible ? '公开' : '私有'}
                  </button>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setEdit({
                          id: r.id,
                          question: r.question,
                          answer_md: r.answer_md,
                          category: r.category ?? '',
                          sort_order: r.sort_order,
                          geo_visible: r.geo_visible,
                        })
                      }
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`删除"${r.question}"?`)) return;
                        try {
                          await deleteFaq(tenantSlug, r.id);
                          router.refresh();
                        } catch (e) {
                          alert(e instanceof Error ? e.message : '失败');
                        }
                      }}
                      className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/[0.10]"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FaqForm({
  tenantSlug,
  initial,
  onClose,
}: {
  tenantSlug: string;
  initial: FaqInput & { id?: string };
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState(initial);

  const submit = () => {
    setErr(null);
    start(async () => {
      try {
        if (initial.id) await updateFaq(tenantSlug, initial.id, v);
        else await createFaq(tenantSlug, v);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">问题 *</span>
        <input
          className="form-input"
          value={v.question}
          onChange={(e) => setV({ ...v, question: e.target.value })}
          placeholder="例:种植牙能用医保吗?"
          maxLength={200}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">答案(markdown)*</span>
        <textarea
          className="form-input min-h-[100px]"
          value={v.answer_md}
          onChange={(e) => setV({ ...v, answer_md: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">分类</span>
          <input
            className="form-input"
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value })}
            placeholder="例:价格 / 流程 / 风险"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">排序(小在前)</span>
          <input
            type="number"
            className="form-input"
            value={v.sort_order}
            onChange={(e) => setV({ ...v, sort_order: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.geo_visible} onChange={(e) => setV({ ...v, geo_visible: e.target.checked })} />
        公开(参与 FAQPage schema)
      </label>

      {err && <div className="rounded-md bg-rose-500/[0.10] px-3 py-2 text-xs text-rose-300">{err}</div>}

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
          disabled={pending || !v.question.trim() || !v.answer_md.trim()}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? '保存中…' : initial.id ? '保存' : '创建'}
        </button>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      还没有 FAQ。建议先建 5-10 条:医保、价格、流程、复诊、风险、术后护理、对比 等高频问题。
    </div>
  );
}
