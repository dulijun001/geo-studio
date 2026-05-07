'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createVocab, type VocabType } from './actions';

const TYPES: Array<{ value: VocabType; label: string; hint: string }> = [
  { value: 'brand', label: '本品牌', hint: '医院 / 诊所主名 + 缩写' },
  { value: 'doctor', label: '医生', hint: '主诊医师姓名,加上「贾医生」这种简称' },
  { value: 'service', label: '服务', hint: '种植牙 / 正畸 / 隐形矫正 等业务名' },
  { value: 'location_alias', label: '城市', hint: '南京 / 南京市 / 玄武区 等地理别名' },
  { value: 'competitor', label: '竞品', hint: '同城同行业的医院,GEO 追踪命中竞品时打标' },
];

export function NewVocabForm({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [term, setTerm] = useState('');
  const [termType, setTermType] = useState<VocabType>('competitor');
  const [aliases, setAliases] = useState('');

  const reset = () => {
    setTerm('');
    setAliases('');
    setErr(null);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        await createVocab(tenantSlug, { term, term_type: termType, aliases });
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '新建失败');
      }
    });
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        新建词条
      </button>
    );
  }

  const activeType = TYPES.find((t) => t.value === termType);

  return (
    <form onSubmit={onSubmit} className="card-elevated mb-2 space-y-4 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">新建词条</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          取消
        </button>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium">类型</span>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => {
            const on = t.value === termType;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTermType(t.value)}
                aria-pressed={on}
                className={
                  'rounded-full px-3 py-1 text-xs transition-colors ' +
                  (on
                    ? 'bg-foreground text-background'
                    : 'border border-border bg-background hover:bg-muted')
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {activeType ? (
          <p className="text-[11px] text-muted-foreground">{activeType.hint}</p>
        ) : null}
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium">
          主名 <span className="text-rose-400">*</span>
        </span>
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          required
          autoFocus
          placeholder={
            termType === 'doctor'
              ? '贾真真'
              : termType === 'competitor'
                ? '南京市口腔医院'
                : termType === 'service'
                  ? '种植牙'
                  : termType === 'location_alias'
                    ? '南京'
                    : 'Demo Dental Hospital'
          }
          className="block w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium">别名(可选,最多 20 个)</span>
        <textarea
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          rows={3}
          placeholder="逗号或换行分隔。例:贾医生, 贾大夫"
          className="block w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        {err ? <p className="mr-auto text-xs text-rose-300">{err}</p> : null}
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? '提交中…' : '保存'}
        </button>
      </div>
    </form>
  );
}
