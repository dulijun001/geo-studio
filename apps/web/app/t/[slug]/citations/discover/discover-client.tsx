'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  bulkInsertCitations,
  discoverCitationCandidates,
  type DiscoveredCandidate,
} from './actions';

const SOURCE_TYPE_LABEL: Record<DiscoveredCandidate['source_type'], string> = {
  guideline: '临床指南',
  industry_standard: '行业标准',
  official_document: '官方文件',
  textbook: '学术著作',
  research_paper: '研究论文',
  other: '其他',
};

type Editable = DiscoveredCandidate & { _selected: boolean };

export function DiscoverClient({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [topic, setTopic] = useState('');
  const [candidates, setCandidates] = useState<Editable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const selectedCount = candidates.filter((c) => c._selected).length;

  function onDiscover() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const res = await discoverCitationCandidates(tenantSlug, { topic: topic.trim() || undefined });
        setCandidates(res.candidates.map((c) => ({ ...c, _selected: true })));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function update<K extends keyof Editable>(idx: number, key: K, val: Editable[K]) {
    setCandidates((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: val } : c)));
  }

  function updateClaim(idx: number, claimIdx: number, val: string) {
    setCandidates((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const next = [...c.key_claims];
        next[claimIdx] = val;
        return { ...c, key_claims: next };
      }),
    );
  }

  function addClaim(idx: number) {
    setCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, key_claims: [...c.key_claims, ''] } : c)),
    );
  }

  function removeClaim(idx: number, claimIdx: number) {
    setCandidates((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        return { ...c, key_claims: c.key_claims.filter((_, ci) => ci !== claimIdx) };
      }),
    );
  }

  function onSubmit() {
    setError(null);
    setDone(null);
    const accepted = candidates
      .filter((c) => c._selected)
      .map(({ _selected: _, ...rest }) => ({
        ...rest,
        key_claims: rest.key_claims.map((k) => k.trim()).filter(Boolean),
      }));
    if (accepted.length === 0) {
      setError('请至少勾选 1 条');
      return;
    }
    startTransition(async () => {
      try {
        const res = await bulkInsertCitations(tenantSlug, accepted);
        setDone(`已入库 ${res.inserted} 条${res.skipped.length ? `,跳过同名 ${res.skipped.length} 条:${res.skipped.join('、')}` : ''}`);
        setCandidates([]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Discovery form */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold">1. 让豆包推荐</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-muted-foreground mb-1">
              主题(可选,留空让豆包覆盖全行业)
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="如:种植牙 / 儿童正畸 / 牙周治疗"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onDiscover}
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:bg-white/10 disabled:text-muted-foreground"
          >
            {pending && candidates.length === 0 ? '推荐中…' : '🔍 发现候选'}
          </button>
        </div>
        {error ? (
          <div className="rounded bg-rose-500/[0.10] border border-rose-500/30 px-3 py-2 text-sm text-rose-300">{error}</div>
        ) : null}
        {done ? (
          <div className="rounded bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{done}</div>
        ) : null}
      </section>

      {/* Candidates table */}
      {candidates.length > 0 ? (
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-base font-semibold">
              2. 审核 {candidates.length} 条候选 · 已选 {selectedCount}
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setCandidates((p) => p.map((c) => ({ ...c, _selected: true })))}
                className="text-emerald-400 hover:underline"
              >
                全选
              </button>
              <button
                onClick={() => setCandidates((p) => p.map((c) => ({ ...c, _selected: false })))}
                className="text-muted-foreground hover:underline"
              >
                清空
              </button>
            </div>
          </header>
          <ul className="divide-y divide-border">
            {candidates.map((c, idx) => (
              <li key={idx} className="px-5 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={c._selected}
                    onChange={(e) => update(idx, '_selected', e.target.checked)}
                    className="mt-1.5"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Header row: title + meta */}
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_8rem_5rem]">
                      <input
                        value={c.title}
                        onChange={(e) => update(idx, 'title', e.target.value)}
                        className="rounded border border-border bg-background px-2 py-1 text-sm font-medium"
                      />
                      <input
                        value={c.issuer}
                        onChange={(e) => update(idx, 'issuer', e.target.value)}
                        placeholder="发布方"
                        className="rounded border border-border bg-background px-2 py-1 text-sm"
                      />
                      <select
                        value={c.source_type}
                        onChange={(e) => update(idx, 'source_type', e.target.value as DiscoveredCandidate['source_type'])}
                        className="rounded border border-border bg-background px-2 py-1 text-sm"
                      >
                        {Object.entries(SOURCE_TYPE_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={c.publication_year ?? ''}
                        onChange={(e) =>
                          update(idx, 'publication_year', e.target.value ? Number(e.target.value) : null)
                        }
                        placeholder="年份"
                        className="rounded border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>

                    {/* Rationale */}
                    <p className="text-xs text-muted-foreground italic">
                      推荐理由:{c.rationale}
                    </p>

                    {/* Key claims */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">
                          key_claims (ground truth · {c.key_claims.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => addClaim(idx)}
                          className="text-xs text-emerald-400 hover:underline"
                        >
                          + 加一条
                        </button>
                      </div>
                      {c.key_claims.map((claim, ci) => (
                        <div key={ci} className="flex gap-2">
                          <input
                            value={claim}
                            onChange={(e) => updateClaim(idx, ci, e.target.value)}
                            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => removeClaim(idx, ci)}
                            className="text-xs text-rose-400 hover:underline"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <footer className="border-t border-border px-5 py-3 text-right">
            <button
              type="button"
              disabled={pending || selectedCount === 0}
              onClick={onSubmit}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {pending ? '入库中…' : `入库 ${selectedCount} 条`}
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
