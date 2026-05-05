'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  createCitation,
  deleteCitation,
  toggleActive,
  updateCitation,
  type CitationInput,
  type CitationSourceType,
} from './actions';

export type CitationRow = {
  id: string;
  title: string;
  title_aliases: string[];
  source_type: CitationSourceType;
  issuer: string | null;
  publication_year: number | null;
  url: string | null;
  notes: string | null;
  key_claims: string[];
  active: boolean;
  updated_at: string;
};

const SOURCE_TYPE_LABELS: Record<CitationSourceType, string> = {
  guideline: '临床指南',
  research_paper: '研究论文',
  textbook: '教科书',
  official_document: '政府/学会文件',
  industry_standard: '国标/行业标准',
  other: '其他',
};

const EMPTY: CitationInput = {
  title: '',
  title_aliases: [],
  source_type: 'guideline',
  issuer: '',
  publication_year: null,
  url: '',
  notes: '',
  key_claims: [],
};

export function CitationsUI({
  tenantSlug,
  rows,
}: {
  tenantSlug: string;
  rows: CitationRow[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ initial: CitationInput; id?: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'has_claims' | 'no_claims'>(
    'all',
  );
  const [q, setQ] = useState('');

  const filtered = rows.filter((r) => {
    if (filter === 'active' && !r.active) return false;
    if (filter === 'inactive' && r.active) return false;
    if (filter === 'has_claims' && r.key_claims.length === 0) return false;
    if (filter === 'no_claims' && r.key_claims.length > 0) return false;
    if (q && !r.title.includes(q) && !(r.issuer ?? '').includes(q)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题或机构…"
            className="form-input w-64 text-sm"
          />
          <Pill val="all" cur={filter} setCur={setFilter} label={`全部 ${rows.length}`} />
          <Pill val="active" cur={filter} setCur={setFilter} label="启用中" />
          <Pill val="inactive" cur={filter} setCur={setFilter} label="已停用" />
          <Pill val="has_claims" cur={filter} setCur={setFilter} label="已配 key_claims" />
          <Pill val="no_claims" cur={filter} setCur={setFilter} label="未配 key_claims" />
        </div>
        <button
          type="button"
          onClick={() => setEdit({ initial: { ...EMPTY } })}
          className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background"
        >
          + 新建引用源
        </button>
      </div>

      {edit && (
        <CitationForm
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((r) => (
            <Card
              key={r.id}
              row={r}
              tenantSlug={tenantSlug}
              onEdit={() =>
                setEdit({
                  id: r.id,
                  initial: {
                    title: r.title,
                    title_aliases: r.title_aliases,
                    source_type: r.source_type,
                    issuer: r.issuer ?? '',
                    publication_year: r.publication_year,
                    url: r.url ?? '',
                    notes: r.notes ?? '',
                    key_claims: r.key_claims,
                  },
                })
              }
              onAfter={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  val,
  cur,
  setCur,
  label,
}: {
  val: 'all' | 'active' | 'inactive' | 'has_claims' | 'no_claims';
  cur: string;
  setCur: (v: 'all' | 'active' | 'inactive' | 'has_claims' | 'no_claims') => void;
  label: string;
}) {
  const active = cur === val;
  return (
    <button
      type="button"
      onClick={() => setCur(val)}
      className={
        'rounded-full px-3 py-1 text-xs ' +
        (active ? 'bg-foreground text-background' : 'border border-border bg-card text-muted-foreground hover:bg-muted')
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
  onAfter,
}: {
  row: CitationRow;
  tenantSlug: string;
  onEdit: () => void;
  onAfter: () => void;
}) {
  const claimsCount = row.key_claims.length;
  return (
    <div
      className={
        'rounded-md border bg-card ' +
        (row.active ? 'border-border' : 'border-dashed border-border opacity-60')
      }
    >
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.title}</span>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
            {SOURCE_TYPE_LABELS[row.source_type]}
          </span>
          {!row.active && (
            <span className="rounded-full border border-muted-foreground/40 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              已停用
            </span>
          )}
          {claimsCount === 0 ? (
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
              title="C1 数字幻觉裁判不会激活"
            >
              ⚠ 未配 key_claims
            </span>
          ) : (
            <span
              className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700"
              title="C1 LLM 裁判已激活"
            >
              ✓ {claimsCount} 条 key_claims
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {row.issuer && <span>{row.issuer}</span>}
          {row.publication_year && <span> · {row.publication_year}</span>}
        </div>
        {row.title_aliases.length > 0 && (
          <div className="text-[11px] text-muted-foreground">
            别名:{row.title_aliases.join(' / ')}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3 text-xs">
        {row.notes && <p className="text-muted-foreground">{row.notes}</p>}
        {claimsCount > 0 && (
          <details>
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              展开 {claimsCount} 条 key_claims
            </summary>
            <ul className="mt-1.5 ml-4 list-disc space-y-1 text-muted-foreground">
              {row.key_claims.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </details>
        )}
        {row.url && (
          <a href={row.url} target="_blank" rel="noopener noreferrer" className="block truncate text-blue-600 hover:underline">
            {row.url}
          </a>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await toggleActive(tenantSlug, row.id, !row.active);
              onAfter();
            } catch (e) {
              alert(e instanceof Error ? e.message : '失败');
            }
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {row.active ? '停用' : '启用'}
        </button>
        <div className="flex gap-2">
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
              if (!confirm(`删除引用源「${row.title}」?\n已发布内容里如果引用过它,会变成 suspected_hallucination,需要人工核实。`))
                return;
              try {
                await deleteCitation(tenantSlug, row.id);
                onAfter();
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
  );
}

function CitationForm({
  tenantSlug,
  initial,
  editId,
  onClose,
}: {
  tenantSlug: string;
  initial: CitationInput;
  editId?: string;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState({
    ...initial,
    aliasesText: initial.title_aliases.join('\n'),
    keyClaimsText: initial.key_claims.join('\n'),
    yearText: initial.publication_year?.toString() ?? '',
  });

  const submit = () => {
    setErr(null);
    start(async () => {
      try {
        const payload: CitationInput = {
          title: v.title,
          title_aliases: v.aliasesText.split('\n').map((s) => s.trim()).filter(Boolean),
          source_type: v.source_type,
          issuer: v.issuer,
          publication_year: v.yearText ? Number.parseInt(v.yearText, 10) : null,
          url: v.url,
          notes: v.notes,
          key_claims: v.keyClaimsText.split('\n').map((s) => s.trim()).filter(Boolean),
        };
        if (editId) await updateCitation(tenantSlug, editId, payload);
        else await createCitation(tenantSlug, payload);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败');
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">标题 *(用《...》格式)</span>
          <input
            className="form-input"
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
            placeholder="《ITI 口腔种植临床指南(第 4 版)》"
            maxLength={200}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">来源类型 *</span>
          <select
            className="form-input"
            value={v.source_type}
            onChange={(e) => setV({ ...v, source_type: e.target.value as CitationSourceType })}
          >
            <option value="guideline">临床指南</option>
            <option value="research_paper">研究论文</option>
            <option value="textbook">教科书</option>
            <option value="official_document">政府/学会文件</option>
            <option value="industry_standard">国标/行业标准</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">发表年份</span>
          <input
            type="number"
            className="form-input"
            value={v.yearText}
            onChange={(e) => setV({ ...v, yearText: e.target.value })}
            placeholder="2023"
            min={1900}
          />
        </label>
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">发布机构</span>
          <input
            className="form-input"
            value={v.issuer}
            onChange={(e) => setV({ ...v, issuer: e.target.value })}
            placeholder="国际口腔种植学会(ITI)"
          />
        </label>
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">URL(选填)</span>
          <input
            className="form-input"
            value={v.url}
            onChange={(e) => setV({ ...v, url: e.target.value })}
            placeholder="https://..."
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          别名 / 缩写(每行一条,最多 10 条)
        </span>
        <textarea
          className="form-input min-h-[60px] text-xs"
          value={v.aliasesText}
          onChange={(e) => setV({ ...v, aliasesText: e.target.value })}
          placeholder={'ITI 指南\nITI 第 4 版\nITI 口腔种植指南'}
        />
        <p className="text-[11px] text-muted-foreground">
          fuzzy match 时降低 false positive。例如主标题《ITI 口腔种植临床指南(第 4 版)》,别名 ['ITI 指南', 'ITI 第 4 版']。
        </p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-amber-700">
          key_claims(关键陈述,每行一条) — C1 数字幻觉裁判用
        </span>
        <textarea
          className="form-input min-h-[120px] text-xs"
          value={v.keyClaimsText}
          onChange={(e) => setV({ ...v, keyClaimsText: e.target.value })}
          placeholder={
            '种植体 5 年存活率 92-98%(指南 2022 版第 3 章)\n种植后 1 年内骨吸收 < 1.5 mm 为正常\n吸烟患者种植失败率比不吸烟者高 1.5-2 倍'
          }
        />
        <p className="text-[11px] text-muted-foreground">
          每条 ≤240 字,最多 30 条。越具体越好(带数据 + 章节出处)。AI 生成里出现引用 + 数字时,LLM 会用这些 ground truth 判定文中数字是否与原文一致。
        </p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">备注(选填)</span>
        <textarea
          className="form-input min-h-[60px] text-xs"
          value={v.notes}
          onChange={(e) => setV({ ...v, notes: e.target.value })}
          placeholder="例如 ITI Treatment Guide 中文版"
          maxLength={500}
        />
      </label>

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
          disabled={pending || !v.title.trim()}
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
      没有匹配的引用源。换个筛选或清空搜索。
    </div>
  );
}
