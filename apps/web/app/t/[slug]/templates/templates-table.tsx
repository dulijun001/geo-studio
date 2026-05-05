'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  createTemplate,
  deleteTemplate,
  previewTemplatePrompt,
  toggleVisibility,
  updateTemplate,
  type TemplatePreview,
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
  // TPL-VW — preview modal state. `null` closed; `pending` while we fetch.
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
        <>
        {preview && (
          <PreviewModal
            preview={preview}
            onClose={() => setPreview(null)}
            tenantSlug={tenantSlug}
          />
        )}
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
              onPreview={async () => {
                setPreviewLoading(true);
                try {
                  const result = await previewTemplatePrompt(tenantSlug, r.id);
                  setPreview(result);
                } catch (e) {
                  alert(e instanceof Error ? e.message : '预览失败');
                } finally {
                  setPreviewLoading(false);
                }
              }}
              previewLoading={previewLoading}
              onAfter={() => router.refresh()}
            />
          ))}
        </div>
        </>
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
  onPreview,
  previewLoading,
  onAfter,
}: {
  row: TemplateRow;
  tenantSlug: string;
  onEdit: () => void;
  onClone: () => void;
  onPreview: () => void;
  previewLoading: boolean;
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
        {/* TPL-VW-2 — collapsible 写作角色 + 意图原文 (prompt_skeleton).
            Always visible (system + custom alike) so operators understand
            what the LLM actually receives. Read-only here; system presets
            require 克隆 to modify. */}
        <details className="group rounded-md border border-dashed border-border bg-muted/20 p-2">
          <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">
            展开看 prompt_skeleton(写作角色 + 意图原文)
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-card p-2 text-[11px] leading-relaxed text-foreground/85">
            {row.prompt_skeleton}
          </pre>
          <p className="mt-1 text-[10px] text-muted-foreground">
            注:这段会拼到合规红线之后,作为「角色 + 意图」注入 LLM 系统提示。
            想看实际拼接后的完整 prompt,点底部「试用预览」。
          </p>
        </details>
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
            onClick={onPreview}
            disabled={previewLoading}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
            title="干跑 buildVariantPrompt,看 LLM 实际收到的 system + user 完整 prompt"
          >
            {previewLoading ? '生成中…' : '试用预览'}
          </button>
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

/**
 * TPL-VW-2 — preview modal showing the actual {system, user} message
 * pair that buildVariantPrompt will hand to the LLM, with this template
 * applied. Sample scenario uses the tenant's brand_name + service_areas
 * + a generic dental topic so the operator sees what real generation
 * looks like without having to commit changes first.
 */
function PreviewModal({
  preview,
  tenantSlug: _tenantSlug,
  onClose,
}: {
  preview: TemplatePreview;
  tenantSlug: string;
  onClose: () => void;
}) {
  // V1: locked to the platform the preview action picked (default wechat_mp).
  // Switching platform / topic from inside the modal requires plumbing the
  // template id through; deferred — operators can re-trigger preview from
  // the card after picking a different sample if they need it.
  const data = preview;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card-elevated flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden bg-card">
        <header className="flex items-baseline justify-between border-b border-border px-6 py-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold">「{data.template_name}」试用预览</h2>
            <p className="text-xs text-muted-foreground">
              干跑 buildVariantPrompt,这是 LLM 实际收到的两条消息(无 LLM 调用,纯字符串拼接)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            预览用示例参数:平台 = {data.platform}、关键词 = 种植牙 / 主题示例。实际起草时
            源素材会被 RAG 召回的真实知识库 markdown 替换,prompt 结构不变。
          </div>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                system
              </span>
              <span className="text-xs text-muted-foreground">
                合规红线 + 写作角色拼接结果(不可变,租户不可改)
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {data.system.length} 字符
              </span>
            </div>
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/20 p-3 text-[11px] leading-relaxed text-foreground">
              {data.system}
            </pre>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                user
              </span>
              <span className="text-xs text-muted-foreground">
                平台格式 + 服务地区 + 关键词 + 结构骨架 + 源素材
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {data.user.length} 字符
              </span>
            </div>
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/20 p-3 text-[11px] leading-relaxed text-foreground">
              {data.user}
            </pre>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            总共 {data.system.length + data.user.length} 字符 · 实际起草时 source_markdown 会替换为 RAG 召回的真实素材
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}
