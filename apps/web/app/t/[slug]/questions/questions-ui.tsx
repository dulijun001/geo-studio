'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  batchPasteQuestions,
  bulkInsertDiscoveredQuestions,
  bulkInsertFanoutQuestions,
  analyzeAndFanoutKeyword,
  createQuestion,
  deleteQuestion,
  discoverQuestions,
  expandQuestionToSubtopics,
  toggleQuestionActive,
  updateQuestion,
} from './actions';
import {
  QUESTION_INTENTS,
  type DiscoveredQuestion,
  type QuestionIntent,
  type FanoutAnalysisResponse,
  type FanoutCandidate,
} from './types';

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
  parent_id: string | null;
  subtopic_source: string | null;
  expansion_seed_topic: string | null;
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
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [intentFilter, setIntentFilter] = useState<QuestionIntent | ''>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [modal, setModal] = useState<'add' | 'edit' | 'paste' | 'dig' | 'fanout' | null>(null);
  const [editing, setEditing] = useState<QuestionRow | null>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.category && r.category !== 'theme' && (activeFilter !== 'active' || r.active)) {
        counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows, activeFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !r.text.toLowerCase().includes(term)) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (intentFilter && r.intent !== intentFilter) return false;
      if (activeFilter === 'active' && !r.active) return false;
      if (activeFilter === 'inactive' && r.active) return false;
      return true;
    });
  }, [rows, search, categoryFilter, intentFilter, activeFilter]);

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
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">全部科室</option>
          {categories.map(([cat, count]) => (
            <option key={cat} value={cat}>
              {cat} ({count})
            </option>
          ))}
        </select>
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
          onClick={() => setModal('fanout')}
          className="rounded border border-sky-500/40 bg-sky-500/[0.12] px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/[0.20]"
        >
          ⚡ AI 扇出拓词 (Fan-out)
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

      {/* Table — overflow-x-auto + min-w:固定 7 列 grid 合计 ~496px 超手机屏,
          外层 admin-shell 又是 overflow-x-hidden,不加横滚内容直接消失(docs/12 P0-3) */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <ul className="min-w-[36rem] divide-y divide-border">
          {filtered.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">
              没有匹配的问题。试试清空筛选,或点右上角添加问题。
            </li>
          ) : (
            filtered.map((q) => {
              const isSubtopic = q.parent_id !== null;
              return (
              <li
                key={q.id}
                className={`grid grid-cols-[1fr_5rem_4rem_4rem_5rem_4rem_8rem] items-center gap-3 px-5 py-3 text-sm ${
                  isSubtopic ? 'border-l-2 border-emerald-500/40 bg-emerald-500/[0.03] pl-7' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className={`${q.active ? '' : 'text-muted-foreground line-through'} flex items-center gap-1.5`}>
                    {isSubtopic ? (
                      <span className="font-mono text-[9px] text-emerald-400">↳ 子</span>
                    ) : null}
                    {q.subtopic_source === 'llm_expand' ? (
                      <span className="rounded-full bg-emerald-500/[0.15] px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">AI</span>
                    ) : null}
                    {q.text}
                  </div>
                  {q.city || q.category || q.expansion_seed_topic ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {q.city ? `📍 ${q.city}` : ''}
                      {q.city && q.category ? ' · ' : ''}
                      {q.category ? `🏷 ${q.category}` : ''}
                      {q.expansion_seed_topic ? (
                        <span className="ml-1 text-emerald-400/70">
                          {q.city || q.category ? ' · ' : ''}↑ 来自「{q.expansion_seed_topic.slice(0, 16)}」
                        </span>
                      ) : null}
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
                {isSubtopic ? (
                  <span className="text-xs text-muted-foreground/60">—</span>
                ) : (
                  <ExpandSubtopicsBtn tenantSlug={tenantSlug} questionId={q.id} text={q.text} onDone={() => router.refresh()} />
                )}
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
              );
            })
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
      {modal === 'fanout' ? (
        <FanoutModal tenantSlug={tenantSlug} onClose={() => setModal(null)} />
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

/**
 * V1.12 D31 — 把主题题 LLM 展开成 8 个长尾子问题。
 * 报告 §3.3:r=0.23 标题与子问题关键词匹配度是唯一显著因子。
 */
function ExpandSubtopicsBtn({
  tenantSlug,
  questionId,
  text,
  onDone,
}: {
  tenantSlug: string;
  questionId: string;
  text: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const handleClick = () => {
    if (
      !confirm(
        `把「${text}」LLM 展开成 8 个长尾子问题?\n\n豆包内部「边想边搜」机制下,1 个原始 query 拆解 8-10 个子查询,我们要建关键词矩阵覆盖。耗时 30-60s,LLM 费约 $0.01。`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const r = await expandQuestionToSubtopics(tenantSlug, questionId, 8);
        const lines = r.subtopics_raw.map((s, i) => `${i + 1}. [${s.intent}] ${s.text}`).join('\n');
        alert(
          `展开完成:入库 ${r.inserted} 条,去重跳过 ${r.skipped.length} 条\n\n${lines}`,
        );
        onDone();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`rounded border px-2 py-1 text-xs ${
        isPending
          ? 'border-border bg-muted/30 text-muted-foreground'
          : 'border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-300 hover:bg-emerald-500/[0.15]'
      }`}
    >
      {isPending ? '展开中…' : '🌳 展开'}
    </button>
  );
}

// =====================================================================
// 2026 GEO: AI Query Fan-out 10 维扇出拓词 Modal
// =====================================================================

function FanoutModal({ tenantSlug, onClose }: { tenantSlug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState('种植牙');
  const [city, setCity] = useState('昆明');
  const [category, setCategory] = useState('种植');
  const [data, setData] = useState<FanoutAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const PRESETS = [
    { label: '种植牙', cat: '种植' },
    { label: '牙齿矫正', cat: '正畸' },
    { label: '儿童早期矫治', cat: '儿牙' },
    { label: '全瓷牙', cat: '修复' },
    { label: '牙周刮治', cat: '牙周' },
    { label: '拔智齿', cat: '综合' },
  ];

  function onAnalyze() {
    if (!keyword.trim()) return;
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const res = await analyzeAndFanoutKeyword(tenantSlug, {
          keyword: keyword.trim(),
          city: city.trim() || undefined,
          category: category.trim() || undefined,
        });
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function toggleCandidate(idx: number) {
    if (!data) return;
    setData({
      ...data,
      candidates: data.candidates.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c)),
    });
  }

  function onSubmit() {
    if (!data) return;
    setError(null);
    setDone(null);
    const selected = data.candidates.filter((c) => c.selected);
    if (selected.length === 0) {
      setError('请至少勾选 1 条扇出子问题');
      return;
    }
    startTransition(async () => {
      try {
        const res = await bulkInsertFanoutQuestions(tenantSlug, {
          seedKeyword: keyword.trim(),
          city: city.trim(),
          category: category.trim() || undefined,
          questions: selected.map((c) => ({
            text: c.text,
            intent: c.intent,
            priority: c.priority,
          })),
        });
        setDone(`扇出拓词成功入库 ${res.inserted} 条${res.skipped.length ? `，跳过 ${res.skipped.length} 条已存在` : ''}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const selectedCount = data?.candidates.filter((c) => c.selected).length ?? 0;

  return (
    <Modal title="⚡ AI 扇出拓词 (Query Fan-out 10 维矩阵)" onClose={onClose} wide>
      <div className="space-y-4">
        {/* 输入面板与预设 */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">核心业务词 (Seed Keyword)</label>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="如: 种植牙 / 隐形矫正"
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">城市</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="昆明"
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">业务品类</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="种植"
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">推荐品类：</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setKeyword(p.label);
                  setCategory(p.cat);
                }}
                className={`rounded border px-2 py-0.5 transition ${
                  keyword === p.label
                    ? 'border-sky-500/50 bg-sky-500/[0.15] text-sky-300'
                    : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onAnalyze}
              disabled={pending || !keyword.trim()}
              className="rounded bg-sky-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {pending && !data ? '正在分析扇出覆盖度…' : '⚡ 诊断覆盖度并生成'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded bg-rose-500/[0.10] border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        ) : null}
        {done ? (
          <div className="rounded bg-emerald-500/[0.10] border border-emerald-500/30 px-3 py-2 text-xs text-emerald-400">
            {done}
          </div>
        ) : null}

        {/* 覆盖度雷达与候选列表 */}
        {data ? (
          <div className="space-y-4">
            {/* 覆盖度卡片 */}
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">
                  「{data.coverage.seedKeyword}」10 维 GEO 扇出覆盖率
                </span>
                <span className="font-semibold text-sky-400">
                  {data.coverage.coverageScore}% ({data.coverage.coveredCount}/{data.coverage.totalDimensions} 维度已覆盖)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${data.coverage.coverageScore}%` }}
                />
              </div>

              {/* 10 维徽章矩阵 */}
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 text-[11px] pt-1">
                {data.coverage.dimensions.map((d) => (
                  <div
                    key={d.spec.id}
                    title={d.covered ? `已有: ${d.matchedQuestions[0]}` : `缺口: ${d.spec.description}`}
                    className={`rounded border px-2 py-1 text-center truncate ${
                      d.covered
                        ? 'border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-300'
                        : 'border-amber-500/40 bg-amber-500/[0.08] text-amber-300 font-medium'
                    }`}
                  >
                    {d.covered ? '✓ ' : '○ 缺 '}
                    {d.spec.label}
                  </div>
                ))}
              </div>
            </div>

            {/* 扇出建议候选列表 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  已选 <strong className="text-foreground">{selectedCount}</strong> / {data.candidates.length} 条扇出题目
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setData({
                        ...data,
                        candidates: data.candidates.map((c) => ({ ...c, selected: true })),
                      })
                    }
                    className="text-sky-400 hover:underline"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setData({
                        ...data,
                        candidates: data.candidates.map((c) => ({ ...c, selected: false })),
                      })
                    }
                    className="text-muted-foreground hover:underline"
                  >
                    取消全选
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-md border border-border">
                {data.candidates.map((cand, idx) => (
                  <label
                    key={idx}
                    className="flex cursor-pointer items-start gap-2.5 p-2.5 hover:bg-accent/40 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={cand.selected}
                      onChange={() => toggleCandidate(idx)}
                      className="mt-0.5 rounded border-border"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-sky-500/[0.12] border border-sky-500/30 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                          {cand.dimensionLabel}
                        </span>
                        <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-muted-foreground">
                          {INTENT_LABEL[cand.intent] ?? cand.intent}
                        </span>
                        <span className="text-[10px] text-amber-400">
                          {'★'.repeat(Math.min(5, Math.ceil(cand.priority / 2)))}
                        </span>
                      </div>
                      <div className="font-medium text-foreground">{cand.text}</div>
                      <div className="text-[11px] text-muted-foreground">{cand.rationale}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={pending || selectedCount === 0}
                  className="rounded bg-emerald-500 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-400 disabled:opacity-50"
                >
                  {pending ? '正在入库…' : `一键入库选中的 ${selectedCount} 条扇出题目`}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          关闭
        </button>
      </ModalFooter>
    </Modal>
  );
}

