'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAiDraftsBatch } from './actions';

// V1 业务范围:仅 3 大长文平台。小红书 / 抖音脚本 / 百家号 暂不在 SOP 内,
// 隐藏选项避免误选。要扩需要先补员工矩阵 + verified_citations 适配。
const PLATFORM_OPTIONS = [
  { id: 'toutiao_article', label: '今日头条', defaultChecked: true },
  { id: 'wechat_mp', label: '微信公众号', defaultChecked: true },
  { id: 'zhihu', label: '知乎', defaultChecked: true },
] as const;

type Question = { id: string; text: string; priority: number | null };
type Template = { id: string; name: string; description: string | null; is_system: boolean };

export function BatchForm({
  tenantSlug,
  questions,
  templates,
}: {
  tenantSlug: string;
  questions: Question[];
  templates: Template[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(PLATFORM_OPTIONS.filter((p) => p.defaultChecked).map((p) => p.id)),
  );
  const [audience, setAudience] = useState('40-60 岁缺牙人群');
  const [templateId, setTemplateId] = useState<string>('');

  const total = selectedQuestions.size * selectedPlatforms.size;
  const canSubmit = selectedQuestions.size > 0 && selectedPlatforms.size > 0 && !pending;

  function toggle(set: Set<string>, val: string, setState: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setState(next);
  }

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createAiDraftsBatch(tenantSlug, {
          question_ids: Array.from(selectedQuestions),
          platforms: Array.from(selectedPlatforms) as never,
          audience: audience.trim() || '通用',
          writing_template_id: templateId || null,
        });
        router.push(`/t/${tenantSlug}/content/batch/${result.batch_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      {/* Questions panel */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">选题(从问题库挑)</h2>
          <span className="text-xs text-muted-foreground">
            已选 {selectedQuestions.size}/{questions.length} · 一次最多 15 题
          </span>
        </header>

        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs text-emerald-400 hover:underline"
            onClick={() => setSelectedQuestions(new Set(questions.slice(0, 10).map((q) => q.id)))}
          >
            一键选前 10
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setSelectedQuestions(new Set())}
          >
            清空
          </button>
        </div>

        <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded border border-border">
          {questions.map((q) => {
            const checked = selectedQuestions.has(q.id);
            return (
              <li key={q.id} className="flex items-start gap-3 px-3 py-2 text-sm hover:bg-accent/30">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(selectedQuestions, q.id, setSelectedQuestions)}
                  className="mt-1 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2">{q.text}</div>
                  {q.priority != null ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      优先级 {q.priority}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Config panel */}
      <section className="space-y-5">
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-semibold">目标平台</h2>
          <div className="space-y-2">
            {PLATFORM_OPTIONS.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedPlatforms.has(p.id)}
                  onChange={() => toggle(selectedPlatforms, p.id, setSelectedPlatforms)}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-semibold">受众</h2>
          <input
            type="text"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="如:40-60 岁缺牙人群"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-semibold">写作要求(可选)</h2>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">— 不用模板,默认 GEO 9 法 —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.is_system ? '⭐ ' : ''}
                {t.name}
              </option>
            ))}
          </select>
          {templateId ? (
            <p className="text-xs text-muted-foreground">
              {templates.find((t) => t.id === templateId)?.description}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border-2 border-emerald-500/30 bg-emerald-500/[0.08] p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-emerald-300">本次将生成</span>
            <span className="text-2xl font-semibold tabular-nums text-emerald-400">{total}</span>
          </div>
          <p className="text-xs text-emerald-400/80">
            {selectedQuestions.size} 题 × {selectedPlatforms.size} 平台 ·
            预计 {Math.ceil(total / 5) * 1.5} - {Math.ceil(total / 5) * 2.5} 分钟
          </p>
          {error ? (
            <p className="rounded bg-rose-500/[0.10] border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="w-full rounded bg-foreground px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-white/10"
          >
            {pending ? '提交中…' : `开始批量生成(${total} 个任务)`}
          </button>
        </div>
      </section>
    </div>
  );
}
