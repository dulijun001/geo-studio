'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  addKeywordsCombine,
  addKeywordsManual,
  createGroup,
  deleteGroup,
  deleteKeywords,
  digKeywords,
  moveKeywords,
  saveDugKeywords,
  type DigResult,
} from './actions';

export type GroupRow = { id: string; name: string; parent_id: string | null };
export type KeywordRow = {
  id: string;
  group_id: string | null;
  text: string;
  source: 'manual' | 'combine' | 'ai_dig';
  intent: string | null;
  created_at: string;
};

type Mode = null | 'manual' | 'combine' | 'dig';

export function KeywordsUI({
  tenantSlug,
  groups,
  keywords,
  selectedGroupId,
}: {
  tenantSlug: string;
  groups: GroupRow[];
  keywords: KeywordRow[];
  selectedGroupId: string | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>(null);
  const [q, setQ] = useState('');
  const [groupName, setGroupName] = useState('');

  const filtered = useMemo(() => {
    return keywords.filter((k) => {
      if (selectedGroupId === '__none__' && k.group_id !== null) return false;
      if (selectedGroupId && selectedGroupId !== '__none__' && k.group_id !== selectedGroupId)
        return false;
      if (q && !k.text.includes(q)) return false;
      return true;
    });
  }, [keywords, selectedGroupId, q]);

  const groupCount = (gid: string | null) =>
    keywords.filter((k) => (gid === null ? k.group_id === null : k.group_id === gid)).length;

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPicked = filtered.length > 0 && filtered.every((k) => picked.has(k.id));
  const toggleAll = () => {
    if (allPicked) setPicked(new Set());
    else setPicked(new Set(filtered.map((k) => k.id)));
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
      {/* Left: groups */}
      <aside className="space-y-3 rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">分组</h3>
        </div>
        <div className="space-y-1">
          <GroupItem
            label="全部"
            count={keywords.length}
            active={!selectedGroupId}
            onClick={() => router.push(`/t/${tenantSlug}/keywords`)}
          />
          <GroupItem
            label="未分组"
            count={groupCount(null)}
            active={selectedGroupId === '__none__'}
            onClick={() => router.push(`/t/${tenantSlug}/keywords?group=__none__`)}
          />
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-1">
              <GroupItem
                label={g.name}
                count={groupCount(g.id)}
                active={selectedGroupId === g.id}
                onClick={() => router.push(`/t/${tenantSlug}/keywords?group=${g.id}`)}
              />
              <button
                type="button"
                title="删除分组(关键词会变为未分组)"
                onClick={async () => {
                  if (!confirm(`删除分组"${g.name}"?(其中的关键词会变为未分组)`)) return;
                  try {
                    await deleteGroup(tenantSlug, g.id);
                    router.refresh();
                  } catch (e) {
                    alert(e instanceof Error ? e.message : '失败');
                  }
                }}
                className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-border pt-3">
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="新分组名"
            className="form-input text-xs"
            maxLength={40}
          />
          <button
            type="button"
            onClick={async () => {
              if (!groupName.trim()) return;
              try {
                await createGroup(tenantSlug, groupName, null);
                setGroupName('');
                router.refresh();
              } catch (e) {
                alert(e instanceof Error ? e.message : '失败');
              }
            }}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs hover:bg-muted"
          >
            + 创建分组
          </button>
        </div>
      </aside>

      {/* Right: list + actions */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索关键词…"
            className="form-input w-72 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
            >
              手动添加
            </button>
            <button
              type="button"
              onClick={() => setMode('combine')}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
            >
              组合拓词
            </button>
            <button
              type="button"
              onClick={() => setMode('dig')}
              className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background"
            >
              ✦ AI 智能挖掘
            </button>
          </div>
        </div>

        {mode === 'manual' && (
          <ManualForm
            tenantSlug={tenantSlug}
            groupId={selectedGroupId === '__none__' ? null : selectedGroupId}
            onClose={() => {
              setMode(null);
              router.refresh();
            }}
          />
        )}
        {mode === 'combine' && (
          <CombineForm
            tenantSlug={tenantSlug}
            groupId={selectedGroupId === '__none__' ? null : selectedGroupId}
            onClose={() => {
              setMode(null);
              router.refresh();
            }}
          />
        )}
        {mode === 'dig' && (
          <DigForm
            tenantSlug={tenantSlug}
            groupId={selectedGroupId === '__none__' ? null : selectedGroupId}
            onClose={() => {
              setMode(null);
              router.refresh();
            }}
          />
        )}

        {/* Bulk action bar */}
        {picked.size > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground bg-foreground/95 px-3 py-2 text-xs text-background">
            <span>已选 {picked.size} 项</span>
            <div className="flex gap-2">
              <select
                onChange={async (e) => {
                  const v = e.target.value;
                  if (!v) return;
                  try {
                    await moveKeywords(tenantSlug, [...picked], v === '__none__' ? null : v);
                    setPicked(new Set());
                    router.refresh();
                  } catch (err) {
                    alert(err instanceof Error ? err.message : '失败');
                  }
                  e.target.value = '';
                }}
                className="rounded-md bg-background px-2 py-1 text-xs text-foreground"
                defaultValue=""
              >
                <option value="">移到分组…</option>
                <option value="__none__">未分组</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`删除 ${picked.size} 个关键词?`)) return;
                  try {
                    await deleteKeywords(tenantSlug, [...picked]);
                    setPicked(new Set());
                    router.refresh();
                  } catch (err) {
                    alert(err instanceof Error ? err.message : '失败');
                  }
                }}
                className="rounded-md bg-rose-500 px-2 py-1 text-xs hover:bg-rose-600"
              >
                批量删除
              </button>
              <button
                type="button"
                onClick={() => setPicked(new Set())}
                className="rounded-md border border-background/30 px-2 py-1 text-xs"
              >
                取消选择
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <Empty />
        ) : (
          <div className="rounded-md border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs">
              <input type="checkbox" checked={allPicked} onChange={toggleAll} />
              <span className="text-muted-foreground">{filtered.length} 个关键词</span>
            </div>
            <ul className="max-h-[600px] divide-y divide-border overflow-auto">
              {filtered.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(k.id)}
                    onChange={() => togglePick(k.id)}
                  />
                  <span className="flex-1 text-sm">{k.text}</span>
                  <SourceTag source={k.source} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs ' +
        (active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')
      }
    >
      <span className="truncate">{label}</span>
      <span className={active ? 'text-background/70' : 'text-muted-foreground/60'}>{count}</span>
    </button>
  );
}

function SourceTag({ source }: { source: KeywordRow['source'] }) {
  const map = {
    manual: { label: '手动', cls: 'bg-muted text-muted-foreground' },
    combine: { label: '组合', cls: 'bg-blue-50 text-blue-700' },
    ai_dig: { label: 'AI', cls: 'bg-purple-50 text-purple-700' },
  } as const;
  const m = map[source];
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${m.cls}`}>{m.label}</span>;
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      还没有关键词。点右上"AI 智能挖掘",输个核心词,30 秒拿到 50 候选。
    </div>
  );
}

// ─── Forms ──────────────────────────────────────────────────────────

function ManualForm({
  tenantSlug,
  groupId,
  onClose,
}: {
  tenantSlug: string;
  groupId: string | null;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [text, setText] = useState('');

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <h4 className="text-sm font-medium">手动添加 — 一行一个,粘贴即可</h4>
      <textarea
        className="form-input min-h-[140px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'例:\n种植牙价格\n种植牙流程\n昆明儿童牙齿矫正'}
      />
      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
      {info && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{info}</div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted">取消</button>
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              setErr(null);
              setInfo(null);
              try {
                const res = await addKeywordsManual(tenantSlug, { group_id: groupId, raw_text: text });
                setInfo(`已新增 ${res.inserted}${res.skipped > 0 ? `,跳过重复 ${res.skipped}` : ''}`);
                setText('');
              } catch (e) {
                setErr(e instanceof Error ? e.message : '失败');
              }
            })
          }
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}

function CombineForm({
  tenantSlug,
  groupId,
  onClose,
}: {
  tenantSlug: string;
  groupId: string | null;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const axes = [
    { key: 'limit' as const, label: 'A 限定词', placeholder: '2024\n2025\n本地' },
    { key: 'modifier' as const, label: 'B 修饰词', placeholder: '性价比\n知名\n畅销' },
    { key: 'core' as const, label: 'C 核心词 *', placeholder: '种植牙\n正畸' },
    { key: 'entity' as const, label: 'D 实体词', placeholder: '医院\n品牌\n医生' },
    { key: 'intent' as const, label: 'E 意图词', placeholder: '价格\n费用\n报价' },
    { key: 'longtail' as const, label: 'F 长尾词', placeholder: '怎么选\n注意事项\n避坑指南' },
  ];
  const [vals, setVals] = useState<Record<string, string>>({});

  const splitVals = (s: string): string[] =>
    s.split('\n').map((x) => x.trim()).filter(Boolean);

  const total = useMemo(() => {
    const n = (k: string) => Math.max(1, splitVals(vals[k] ?? '').length);
    const cores = splitVals(vals.core ?? '');
    if (cores.length === 0) return 0;
    let p = 1;
    for (const k of ['limit', 'modifier', 'core', 'entity', 'intent', 'longtail']) {
      p *= n(k);
    }
    return p;
  }, [vals]);

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">组合拓词 — 6 维笛卡尔积(留空轴自动跳过)</h4>
        <span className={'text-xs ' + (total > 200 ? 'text-rose-700' : total > 0 ? 'text-emerald-700' : 'text-muted-foreground')}>
          预计生成 {total} 条{total > 200 ? '(超 200 上限)' : ''}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {axes.map((ax) => (
          <label key={ax.key} className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{ax.label}</span>
            <textarea
              className="form-input min-h-[100px] text-xs"
              value={vals[ax.key] ?? ''}
              onChange={(e) => setVals({ ...vals, [ax.key]: e.target.value })}
              placeholder={ax.placeholder}
            />
          </label>
        ))}
      </div>
      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
      {info && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{info}</div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted">取消</button>
        <button
          type="button"
          disabled={pending || total === 0 || total > 200}
          onClick={() =>
            start(async () => {
              setErr(null);
              setInfo(null);
              try {
                const res = await addKeywordsCombine(tenantSlug, {
                  group_id: groupId,
                  core: splitVals(vals.core ?? ''),
                  limit: splitVals(vals.limit ?? ''),
                  modifier: splitVals(vals.modifier ?? ''),
                  entity: splitVals(vals.entity ?? ''),
                  intent: splitVals(vals.intent ?? ''),
                  longtail: splitVals(vals.longtail ?? ''),
                });
                setInfo(`组合 ${res.total} 条 → 新增 ${res.inserted}${res.skipped > 0 ? `,跳过重复 ${res.skipped}` : ''}`);
              } catch (e) {
                setErr(e instanceof Error ? e.message : '失败');
              }
            })
          }
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? '生成中…' : '生成并保存'}
        </button>
      </div>
    </div>
  );
}

function DigForm({
  tenantSlug,
  groupId,
  onClose,
}: {
  tenantSlug: string;
  groupId: string | null;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [savePending, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [seed, setSeed] = useState('');
  const [result, setResult] = useState<DigResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const allPicked = result && result.candidates.length > 0 && result.candidates.every((c) => picked.has(c));
  const togglePick = (c: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <h4 className="text-sm font-medium">AI 智能挖掘 — 输入核心词,豆包生成约 50 候选,自动过合规黑名单</h4>
      <div className="flex gap-2">
        <input
          className="form-input flex-1"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="例:种植牙 / 隐形矫正 / 儿童牙齿"
          maxLength={30}
        />
        <button
          type="button"
          disabled={pending || !seed.trim()}
          onClick={() =>
            start(async () => {
              setErr(null);
              setInfo(null);
              setResult(null);
              setPicked(new Set());
              try {
                const r = await digKeywords(tenantSlug, { seed });
                setResult(r);
                if (r.used_stub) setInfo('未配置 ARK_API_KEY,本次返回的是本地占位候选');
              } catch (e) {
                setErr(e instanceof Error ? e.message : '失败');
              }
            })
          }
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? '挖掘中…' : '开始挖掘'}
        </button>
      </div>

      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
      {info && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{info}</div>}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              候选 {result.candidates.length} 个 · 已合规过滤 {result.rejected.length} 个
            </span>
            <button
              type="button"
              onClick={() =>
                setPicked(allPicked ? new Set() : new Set(result.candidates))
              }
              className="text-foreground hover:underline"
            >
              {allPicked ? '清空选择' : '全选'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-muted/20 p-3">
            {result.candidates.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => togglePick(c)}
                className={
                  'rounded-full px-3 py-1 text-xs transition ' +
                  (picked.has(c)
                    ? 'border border-foreground bg-foreground text-background'
                    : 'border border-border bg-card hover:bg-muted')
                }
              >
                {c}
              </button>
            ))}
          </div>

          {result.rejected.length > 0 && (
            <details className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-rose-700">
                合规过滤掉 {result.rejected.length} 个候选(展开看原因)
              </summary>
              <ul className="mt-2 space-y-0.5 text-rose-700/80">
                {result.rejected.map((r, i) => (
                  <li key={i}>
                    <span className="font-mono">{r.term}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted">关闭</button>
        <button
          type="button"
          disabled={savePending || picked.size === 0}
          onClick={() =>
            startSave(async () => {
              setErr(null);
              setInfo(null);
              try {
                const r = await saveDugKeywords(tenantSlug, groupId, [...picked]);
                setInfo(`已保存 ${r.inserted}${r.skipped > 0 ? `,跳过重复 ${r.skipped}` : ''}`);
                setPicked(new Set());
              } catch (e) {
                setErr(e instanceof Error ? e.message : '失败');
              }
            })
          }
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {savePending ? '保存中…' : `保存选中(${picked.size})`}
        </button>
      </div>
    </div>
  );
}
