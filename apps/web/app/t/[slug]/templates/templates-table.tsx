'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  createTemplate,
  deleteTemplate,
  toggleVisibility,
  updateTemplate,
  type WritingTemplateInput,
} from './actions';

export type TemplateRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  prompt_skeleton: string;
  structure_hint: { sections?: string[]; min_sections?: number } | null;
  is_system: boolean;
  visible: boolean;
  updated_at: string;
  /** TPL-2 — count of content_items that picked this template. Default 0. */
  usage_count?: number;
};

const EMPTY: WritingTemplateInput = {
  slug: '',
  name: '',
  description: '',
  prompt_skeleton: '',
  sections_text: '',
  min_sections: null,
};

export function TemplatesTable({
  tenantSlug,
  rows,
}: {
  tenantSlug: string;
  rows: TemplateRow[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<
    { initial: WritingTemplateInput; id?: string } | null
  >(null);
  const [filter, setFilter] = useState<'all' | 'system' | 'custom' | 'hidden'>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'system' && !r.is_system) return false;
      if (filter === 'custom' && r.is_system) return false;
      if (filter === 'hidden' && r.visible) return false;
      if (q && !r.name.includes(q) && !r.slug.includes(q)) return false;
      return true;
    });
  }, [rows, filter, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索名称 / slug…"
            className="form-input w-56 text-sm"
          />
          <FilterPill val="all" cur={filter} setCur={setFilter} label={`全部 ${rows.length}`} />
          <FilterPill val="system" cur={filter} setCur={setFilter} label="系统预设" />
          <FilterPill val="custom" cur={filter} setCur={setFilter} label="自定义" />
          <FilterPill val="hidden" cur={filter} setCur={setFilter} label="已隐藏" />
        </div>
        <button
          type="button"
          onClick={() => setEdit({ initial: { ...EMPTY } })}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background"
        >
          + 新建模板
        </button>
      </div>

      {edit && (
        <TemplateForm
          tenantSlug={tenantSlug}
          initial={edit.initial}
          editId={edit.id}
          onClose={() => {
            setEdit(null);
            router.refresh();
          }}
        />
      )}

      {filtered.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <Card
              key={r.id}
              row={r}
              tenantSlug={tenantSlug}
              onEdit={() => {
                if (r.is_system) return;
                setEdit({
                  id: r.id,
                  initial: {
                    slug: r.slug,
                    name: r.name,
                    description: r.description ?? '',
                    prompt_skeleton: r.prompt_skeleton,
                    sections_text: (r.structure_hint?.sections ?? []).join('\n'),
                    min_sections: r.structure_hint?.min_sections ?? null,
                  },
                });
              }}
              onClone={() => {
                // TPL-3 — clone any template (system or custom) into a new
                // tenant-owned editable copy. slug auto-suffixed with -copy.
                setEdit({
                  initial: {
                    slug: ensureUniqueSlug(`${r.slug}-copy`, rows),
                    name: `${r.name}(副本)`,
                    description: r.description ?? '',
                    prompt_skeleton: r.prompt_skeleton,
                    sections_text: (r.structure_hint?.sections ?? []).join('\n'),
                    min_sections: r.structure_hint?.min_sections ?? null,
                  },
                });
              }}
              onAfter={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  val,
  cur,
  setCur,
  label,
}: {
  val: 'all' | 'system' | 'custom' | 'hidden';
  cur: string;
  setCur: (v: 'all' | 'system' | 'custom' | 'hidden') => void;
  label: string;
}) {
  const active = cur === val;
  return (
    <button
      type="button"
      onClick={() => setCur(val)}
      className={
        'rounded-full px-3 py-1 text-xs ' +
        (active
          ? 'bg-foreground text-background'
          : 'border border-border bg-card text-muted-foreground hover:bg-muted')
      }
    >
      {label}
    </button>
  );
}

function Card({
  row,
  tenantSlug,
  onEdit,
  onClone,
  onAfter,
}: {
  row: TemplateRow;
  tenantSlug: string;
  onEdit: () => void;
  onClone: () => void;
  onAfter: () => void;
}) {
  const sections = row.structure_hint?.sections ?? [];
  const usage = row.usage_count ?? 0;
  return (
    <div className={'rounded-md border bg-card ' + (row.visible ? 'border-border' : 'border-dashed border-border opacity-60')}>
      <div className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.name}</span>
            {row.is_system ? (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                系统预设
              </span>
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                自定义
              </span>
            )}
            {!row.visible && (
              <span className="rounded-full border border-muted-foreground/40 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                已隐藏
              </span>
            )}
            {usage > 0 && (
              <span
                className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
                title="此模板已被多少篇 content_items 选用"
              >
                用过 {usage}
              </span>
            )}
          </div>
          <code className="text-xs text-muted-foreground">{row.slug}</code>
        </div>
      </div>
      <div className="space-y-2 p-3 text-xs">
        {row.description && <p className="text-muted-foreground">{row.description}</p>}
        {sections.length > 0 && (
          <div>
            <div className="mb-1 font-medium text-muted-foreground">结构骨架</div>
            <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
              {sections.slice(0, 4).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
              {sections.length > 4 && <li>…还有 {sections.length - 4} 节</li>}
            </ul>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await toggleVisibility(
                tenantSlug,
                row.id,
                row.is_system,
                row.is_system ? row.slug : null,
                !row.visible,
              );
              onAfter();
            } catch (e) {
              alert(e instanceof Error ? e.message : '失败');
            }
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {row.visible ? '隐藏' : '显示'}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClone}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
            title={row.is_system ? '克隆系统预设到自定义,可编辑' : '克隆此模板'}
          >
            克隆
          </button>
          {!row.is_system && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
              >
                编辑
              </button>
              <button
                type="button"
                onClick={async () => {
                  const warn = usage > 0
                    ? `「${row.name}」已被 ${usage} 篇内容选用过。删除模板不会删除已生成的内容,但下次创作向导里会消失。确认删除?`
                    : `删除模板"${row.name}"?`;
                  if (!confirm(warn)) return;
                  try {
                    await deleteTemplate(tenantSlug, row.id);
                    onAfter();
                  } catch (e) {
                    alert(e instanceof Error ? e.message : '失败');
                  }
                }}
                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
              >
                删除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateForm({
  tenantSlug,
  initial,
  editId,
  onClose,
}: {
  tenantSlug: string;
  initial: WritingTemplateInput;
  editId?: string;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState(initial);

  const submit = () => {
    setErr(null);
    start(async () => {
      try {
        if (editId) await updateTemplate(tenantSlug, editId, v);
        else await createTemplate(tenantSlug, v);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">名称 *</span>
          <input
            className="form-input"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            placeholder="例:私域社群话术"
            maxLength={40}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">slug *</span>
          <input
            className="form-input font-mono"
            value={v.slug}
            onChange={(e) => setV({ ...v, slug: e.target.value })}
            placeholder="例:private-community"
            maxLength={40}
            disabled={!!editId}
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">说明</span>
        <input
          className="form-input"
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="简单描述这个写作要求适合什么场景"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">prompt_skeleton *(写作角色 + 意图,会拼到合规红线之后)</span>
        <textarea
          className="form-input min-h-[180px] font-mono text-xs"
          value={v.prompt_skeleton}
          onChange={(e) => setV({ ...v, prompt_skeleton: e.target.value })}
          placeholder={'━━━ 写作角色:XXX ━━━\n你的任务是...\n- 要点 1\n- 要点 2'}
        />
        <p className="text-[11px] text-muted-foreground">
          ⚠️ 不要在此处定义合规红线 — 已由系统预定义。仅写"角色 + 结构 + 语气倾向"。
        </p>
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="col-span-2 block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">结构骨架(每行一节)</span>
          <textarea
            className="form-input min-h-[80px] text-xs"
            value={v.sections_text}
            onChange={(e) => setV({ ...v, sections_text: e.target.value })}
            placeholder={'## 概念基础\n## 操作要点\n## 常见误区'}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">至少节段数</span>
          <input
            type="number"
            className="form-input"
            value={v.min_sections ?? ''}
            min={0}
            max={20}
            onChange={(e) =>
              setV({
                ...v,
                min_sections: e.target.value ? Number.parseInt(e.target.value, 10) : null,
              })
            }
            placeholder="如 3"
          />
        </label>
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
          disabled={pending || !v.name.trim() || !v.slug.trim() || !v.prompt_skeleton.trim()}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? '保存中…' : editId ? '保存' : '创建'}
        </button>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      没有匹配的模板。试试切换筛选或清空搜索。
    </div>
  );
}

/**
 * Find a slug that doesn't collide with anything in the current page's row
 * set. Server-side createTemplate has authoritative collision detection
 * (cross-scope: system + tenant); this is a UX nicety so the user doesn't
 * have to manually adjust the suffix on first try.
 */
function ensureUniqueSlug(candidate: string, rows: TemplateRow[]): string {
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(candidate)) return candidate;
  for (let i = 2; i < 100; i++) {
    const next = `${candidate}-${i}`;
    if (!taken.has(next)) return next;
  }
  return `${candidate}-${Date.now()}`;
}
