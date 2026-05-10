'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  batchPasteQuestions,
  bulkInsertDiscoveredQuestions,
  createQuestion,
  deleteQuestion,
  discoverQuestions,
  toggleQuestionActive,
  updateQuestion,
} from './actions';
import { QUESTION_INTENTS, type DiscoveredQuestion, type QuestionIntent } from './types';

export type QuestionRow = {
  id: string;
  text: string;
  intent: QuestionIntent | null;
  city: string | null;
  category: string | null;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const INTENT_LABEL: Record<QuestionIntent, string> = {
  local_recommendation: '本地推荐',
  price_inquiry: '价格',
  doctor_review: '品牌评价',
  procedure_info: '流程操作',
  risk_concern: '风险担忧',
  comparison: '对比',
  other: '其他',
};

export function QuestionsUI({
  tenantSlug,
  rows,
}: {
  tenantSlug: string;
  rows: QuestionRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [intentFilter, setIntentFilter] = useState<QuestionIntent | ''>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [modal, setModal] = useState<'add' | 'edit' | 'paste' | 'dig' | null>(null);
  const [editing, setEditing] = useState<QuestionRow | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !r.text.toLowerCase().includes(term)) return false;
      if (intentFilter && r.intent !== intentFilter) return false;
      if (activeFilter === 'active' && !r.active) return false;
      if (activeFilter === 'inactive' && r.active) return false;
      return true;
    });
  }, [rows, search, intentFilter, activeFilter]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="搜索问题文本…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[12rem] rounded border border-border bg-background px-3 py-1.5 text-sm"
        />
        <select
          value={intentFilter}
          onChange={(e) => setIntentFilter(e.target.value as QuestionIntent | '')}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">全部意图</option>
          {QUESTION_INTENTS.map((i) => (
            <option key={i} value={i}>{INTENT_LABEL[i]}</option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="all">全部状态</option>
          <option value="active">启用</option>
          <option value="inactive">停用</option>
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setModal('add')}
          className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          + 新增
        </button>
        <button
          type="button"
          onClick={() => setModal('paste')}
          className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          📋 批量粘贴
        </button>
        <button
          type="button"
          onClick={() => setModal('dig')}
          className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          🔍 AI 自动挖掘
        </button>
      </div>

      <div className="text-xs text-muted-foreground">
        显示 {filtered.length} / {rows.length}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <ul className="divide-y divide-border">
          {filtered.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">
              没有匹配的问题。试试清空筛选,或点右上角添加问题。
            </li>
          ) : (
            filtered.map((q) => (
              <li
                key={q.id}
                className="grid grid-cols-[1fr_5rem_4rem_4rem_4rem_8rem] items-center gap-3 px-5 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className={q.active ? '' : 'text-muted-foreground line-through'}>
                    {q.text}
                  </div>
                  {q.city || q.category ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {q.city ? `📍 ${q.city}` : ''}
                      {q.city && q.category ? ' · ' : ''}
                      {q.category ? `🏷 ${q.category}` : ''}
                    </div>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {q.intent ? INTENT_LABEL[q.intent] : '—'}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  P{q.priority}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await toggleQuestionActive(tenantSlug, q.id, !q.active);
                      router.refresh();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : String(err));
                    }
                  }}
                  className={`rounded px-2 py-0.5 text-xs ${q.active ? 'bg-emerald-500/[0.12] text-emerald-400' : 'bg-white/[0.06] text-muted-foreground'}`}
                >
                  {q.active ? '启用' : '停用'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(q);
                    setModal('edit');
                  }}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`删除问题「${q.text}」?(软删,历史 batch_items 不会丢)`)) return;
                    try {
                      await deleteQuestion(tenantSlug, q.id);
                      router.refresh();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : String(err));
                    }
                  }}
                  className="rounded border border-rose-500/30 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/[0.10]"
                >
                  删除
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Modals */}
      {modal === 'add' ? (
        <QuestionFormModal
          tenantSlug={tenantSlug}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === 'edit' && editing ? (
        <QuestionFormModal
          tenantSlug={tenantSlug}
          editing={editing}
          onClose={() => {
            setModal(null);
            setEditing(null);
          }}
        />
      ) : null}
      {modal === 'paste' ? (
        <BatchPasteModal tenantSlug={tenantSlug} onClose={() => setModal(null)} />
      ) : null}
      {modal === 'dig' ? (
        <DigModal tenantSlug={tenantSlug} onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}

// =====================================================================
// Add / Edit modal
// =====================================================================

function QuestionFormModal({
  tenantSlug,
  editing,
  onClose,
}: {
  tenantSlug: string;
  editing?: QuestionRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(editing?.text ?? '');
  const [intent, setIntent] = useState<QuestionIntent | ''>(editing?.intent ?? '');
  const [city, setCity] = useState(editing?.city ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [priority, setPriority] = useState<number>(editing?.priority ?? 5);
  const [active, setActive] = useState<boolean>(editing?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          text,
          intent: (intent || null) as QuestionIntent | null,
          city: city || null,
          category: category || null,
          priority,
          active,
        };
        if (editing) await updateQuestion(tenantSlug, editing.id, input);
        else await createQuestion(tenantSlug, input);
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Modal title={editing ? '编辑问题' : '新增问题'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="问题文本(必填)">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            placeholder="如:种植牙怕疼怎么办"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="意图分类">
            <select
              value={intent}
              onChange={(e) => setIntent(e.target.value as QuestionIntent | '')}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— 未分类 —</option>
              {QUESTION_INTENTS.map((i) => (
                <option key={i} value={i}>{INTENT_LABEL[i]}</option>
              ))}
            </select>
          </Field>
          <Field label="优先级 (0-10)">
            <input
              type="number"
              min={0}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="城市(可选)">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="如:昆明"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="品类(可选)">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="如:种植 / 正畸"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          启用(参与批量起草)
        </label>

        {error ? (
          <div className="rounded bg-rose-500/[0.10] border border-rose-500/30 px-3 py-2 text-xs text-rose-300">{error}</div>
        ) : null}
      </div>

      <ModalFooter>
        <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent">
          取消
        </button>
        <button
          onClick={onSave}
          disabled={pending || !text.trim()}
          className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:bg-white/10"
        >
          {pending ? '保存中…' : editing ? '保存修改' : '新增'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// =====================================================================
// Batch paste modal
// =====================================================================

function BatchPasteModal({
  tenantSlug,
  onClose,
}: {
  tenantSlug: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [raw, setRaw] = useState('');
  const [intent, setIntent] = useState<QuestionIntent | ''>('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const lineCount = raw.split(/\r?\n/).filter((l) => l.trim()).length;

  function onSubmit() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const res = await batchPasteQuestions(tenantSlug, raw, {
          intent: (intent || null) as QuestionIntent | null,
          city: city || null,
          category: category || null,
          priority,
        });
        setDone(`入库 ${res.inserted} 条${res.skipped.length ? `,跳过 ${res.skipped.length} 条已存在` : ''}`);
        setRaw('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Modal title="批量粘贴问题" onClose={onClose}>
      <div className="space-y-3">
        <Field label={`每行一题 · 检测到 ${lineCount} 行`}>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={10}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono"
            placeholder={'种植牙怕疼怎么办\n种植牙能用多少年\n昆明哪家做种植牙好\n…'}
          />
        </Field>

        <div className="rounded bg-white/[0.04] border border-border p-3 space-y-2 text-xs">
          <div className="font-medium">这批共享的标签(可选,所有粘贴行都用)</div>
          <div className="grid grid-cols-4 gap-2">
            <select
              value={intent}
              onChange={(e) => setIntent(e.target.value as QuestionIntent | '')}
              className="rounded border border-border bg-background px-2 py-1"
            >
              <option value="">意图</option>
              {QUESTION_INTENTS.map((i) => (
                <option key={i} value={i}>{INTENT_LABEL[i]}</option>
              ))}
            </select>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="城市"
              className="rounded border border-border bg-background px-2 py-1"
            />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="品类"
              className="rounded border border-border bg-background px-2 py-1"
            />
            <input
              type="number"
              min={0}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
              placeholder="优先级"
              className="rounded border border-border bg-background px-2 py-1"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded bg-rose-500/[0.10] border border-rose-500/30 px-3 py-2 text-xs text-rose-300">{error}</div>
        ) : null}
        {done ? (
          <div className="rounded bg-emerald-500/[0.10] border border-emerald-500/30 px-3 py-2 text-xs text-emerald-400">{done}</div>
        ) : null}
      </div>

      <ModalFooter>
        <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent">
          关闭
        </button>
        <button
          onClick={onSubmit}
          disabled={pending || lineCount === 0}
          className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:bg-white/10"
        >
          {pending ? '入库中…' : `入库 ${lineCount} 条`}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// =====================================================================
// AI dig modal
// =====================================================================

type DigEditable = DiscoveredQuestion & { _selected: boolean };

function DigModal({ tenantSlug, onClose }: { tenantSlug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState('');
  const [candidates, setCandidates] = useState<DigEditable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const selectedCount = candidates.filter((c) => c._selected).length;

  function onDig() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const res = await discoverQuestions(tenantSlug, { category: category.trim() || undefined });
        setCandidates(res.questions.map((q) => ({ ...q, _selected: true })));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function update<K extends keyof DigEditable>(idx: number, key: K, val: DigEditable[K]) {
    setCandidates((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: val } : c)));
  }

  function onSubmit() {
    setError(null);
    setDone(null);
    const accepted = candidates
      .filter((c) => c._selected)
      .map(({ _selected: _, ...rest }) => rest);
    if (accepted.length === 0) {
      setError('请至少勾选 1 条');
      return;
    }
    startTransition(async () => {
      try {
        const res = await bulkInsertDiscoveredQuestions(tenantSlug, accepted);
        setDone(`入库 ${res.inserted} 条${res.skipped.length ? `,跳过 ${res.skipped.length} 条同名` : ''}`);
        setCandidates([]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Modal title="🔍 AI 自动挖掘问题" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <Field label="可选 — 限定品类(留空让豆包覆盖整个行业)">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="如:种植 / 儿牙 / 正畸"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <button
            onClick={onDig}
            disabled={pending}
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:bg-white/10"
          >
            {pending && candidates.length === 0 ? '挖掘中…' : '🔍 推荐 20 题'}
          </button>
        </div>

        {error ? (
          <div className="rounded bg-rose-500/[0.10] border border-rose-500/30 px-3 py-2 text-sm text-rose-300">{error}</div>
        ) : null}
        {done ? (
          <div className="rounded bg-emerald-500/[0.10] border border-emerald-500/30 px-3 py-2 text-sm text-emerald-400">{done}</div>
        ) : null}

        {candidates.length > 0 ? (
          <>
            <div className="flex items-center justify-between text-xs">
              <span>已选 {selectedCount}/{candidates.length}</span>
              <div className="flex gap-2">
                <button onClick={() => setCandidates((p) => p.map((c) => ({ ...c, _selected: true })))} className="text-emerald-400 hover:underline">
                  全选
                </button>
                <button onClick={() => setCandidates((p) => p.map((c) => ({ ...c, _selected: false })))} className="text-muted-foreground hover:underline">
                  清空
                </button>
              </div>
            </div>

            <ul className="max-h-[24rem] overflow-y-auto divide-y divide-border rounded border border-border">
              {candidates.map((c, idx) => (
                <li key={idx} className="px-3 py-2 text-sm">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={c._selected}
                      onChange={(e) => update(idx, '_selected', e.target.checked)}
                      className="mt-1.5"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <input
                        value={c.text}
                        onChange={(e) => update(idx, 'text', e.target.value)}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                      />
                      <div className="grid grid-cols-[5rem_5rem_5rem_1fr] gap-2">
                        <select
                          value={c.intent}
                          onChange={(e) => update(idx, 'intent', e.target.value as QuestionIntent)}
                          className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                        >
                          {QUESTION_INTENTS.map((i) => (
                            <option key={i} value={i}>{INTENT_LABEL[i]}</option>
                          ))}
                        </select>
                        <input
                          value={c.category ?? ''}
                          onChange={(e) => update(idx, 'category', e.target.value)}
                          placeholder="品类"
                          className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                        />
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={c.priority}
                          onChange={(e) => update(idx, 'priority', Number(e.target.value) || 0)}
                          className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                        />
                        <span className="line-clamp-1 self-center text-xs italic text-muted-foreground" title={c.rationale}>
                          {c.rationale}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="text-right">
              <button
                onClick={onSubmit}
                disabled={pending || selectedCount === 0}
                className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-400 disabled:bg-emerald-500/40"
              >
                入库 {selectedCount} 条
              </button>
            </div>
          </>
        ) : null}
      </div>

      <ModalFooter>
        <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent">
          关闭
        </button>
      </ModalFooter>
    </Modal>
  );
}

// =====================================================================
// Reusable modal shell
// =====================================================================

function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-lg bg-card shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-muted-foreground hover:text-foreground">
            ×
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <footer className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">{children}</footer>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
