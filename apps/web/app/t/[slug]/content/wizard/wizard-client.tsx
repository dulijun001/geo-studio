'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { createAiDraft } from '../actions';

export type WizardTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  structure_hint: { sections?: string[]; min_sections?: number } | null;
  is_system: boolean;
};

export type WizardKeyword = {
  id: string;
  group_id: string | null;
  text: string;
  source: 'manual' | 'combine' | 'ai_dig';
};

export type WizardGroup = { id: string; name: string };

export type WizardKbDoc = {
  source_path: string;
  title: string | null;
  excerpt: string | null;
  category: string | null;
};

const PLATFORMS: Array<{
  value: 'wechat_mp' | 'zhihu' | 'toutiao_article' | 'douyin_script' | 'xiaohongshu';
  label: string;
  hint: string;
}> = [
  { value: 'wechat_mp', label: '公众号', hint: '故事化 + 情感共鸣 + 长文' },
  { value: 'zhihu', label: '知乎', hint: '硬核 + 引用 + 数据' },
  { value: 'toutiao_article', label: '头条号', hint: '资讯感 + SEO 友好' },
  { value: 'douyin_script', label: '抖音脚本', hint: '15-60s 分镜 + 强钩子' },
  { value: 'xiaohongshu', label: '小红书', hint: '口语 + emoji + 痛点钩子' },
];

export function WizardClient({
  tenantSlug,
  templates,
  keywords,
  groups,
  kbDocs,
}: {
  tenantSlug: string;
  templates: WizardTemplate[];
  keywords: WizardKeyword[];
  groups: WizardGroup[];
  kbDocs: WizardKbDoc[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [docFilter, setDocFilter] = useState('');
  const [pickedDocs, setPickedDocs] = useState<Set<string>>(new Set());

  // Step 2
  const [pickedKeywords, setPickedKeywords] = useState<Set<string>>(new Set());
  const [kwFilter, setKwFilter] = useState('');

  // Step 3
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]['value']>('wechat_mp');

  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const filteredDocs = useMemo(
    () =>
      kbDocs.filter((d) =>
        docFilter
          ? (d.title ?? '').includes(docFilter) || d.source_path.includes(docFilter)
          : true,
      ),
    [kbDocs, docFilter],
  );

  const filteredKw = useMemo(
    () => (kwFilter ? keywords.filter((k) => k.text.includes(kwFilter)) : keywords),
    [keywords, kwFilter],
  );

  const step1Valid = topic.trim().length >= 2 && audience.trim().length > 0;
  const canProceedFromStep1 = step1Valid; // Doc selection optional — recall is auto
  const canFinish = step1Valid && templateId !== null;

  const submit = () => {
    setErr(null);
    start(async () => {
      try {
        const result = await createAiDraft(tenantSlug, {
          topic: topic.trim(),
          audience: audience.trim(),
          platform,
          writing_template_id: templateId,
          keyword_ids: [...pickedKeywords],
          preferred_doc_paths: [...pickedDocs],
        });
        router.push(`/t/${tenantSlug}/content/${result.content_item_id}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '生成失败');
      }
    });
  };

  return (
    <div className="space-y-4">
      <Stepper step={step} setStep={setStep} step1Valid={step1Valid} />

      {step === 1 && (
        <div className="space-y-4 rounded-md border border-border bg-card p-5">
          <h3 className="text-sm font-medium">第 1 步:确定参考资料</h3>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">主题 *(2-30 字)</span>
              <input
                className="form-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例:糖尿病人能不能种牙"
                maxLength={30}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">目标受众 *</span>
              <input
                className="form-input"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="例:40-60 岁有种植需求的患者"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                参考资料(可选 — 留空则按主题自动召回知识库)
                {pickedDocs.size > 0 && ` · 已选 ${pickedDocs.size}`}
              </span>
              <input
                value={docFilter}
                onChange={(e) => setDocFilter(e.target.value)}
                placeholder="按标题 / 路径筛选"
                className="form-input w-48 text-xs"
              />
            </div>
            <div className="max-h-72 space-y-1 overflow-auto rounded-md border border-border bg-muted/20 p-2">
              {filteredDocs.slice(0, 60).map((d) => (
                <label
                  key={d.source_path}
                  className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-card"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={pickedDocs.has(d.source_path)}
                    onChange={() =>
                      setPickedDocs((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.source_path)) next.delete(d.source_path);
                        else next.add(d.source_path);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {d.category && (
                        <span className="rounded-full bg-muted px-1.5 text-[10px]">{d.category}</span>
                      )}
                      <span className="truncate font-medium">{d.title ?? d.source_path}</span>
                    </div>
                    <div className="truncate text-muted-foreground">
                      {d.excerpt ?? d.source_path}
                    </div>
                  </div>
                </label>
              ))}
              {filteredDocs.length > 60 && (
                <div className="px-2 py-1 text-[11px] text-muted-foreground">
                  …还有 {filteredDocs.length - 60} 篇,用筛选缩小范围
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              注:RAG 会基于主题自动选 5 篇最相关素材。**手动勾选的会被强制纳入**(优先于 RAG 排名),其余空位再用 RAG 召回填满。勾超 5 篇时全部纳入,RAG 让位。
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceedFromStep1}
              className="rounded-md border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              下一步:选关键词 →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-md border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              第 2 步:植入关键词 · 已选 {pickedKeywords.size}
            </h3>
            <input
              value={kwFilter}
              onChange={(e) => setKwFilter(e.target.value)}
              placeholder="搜索关键词…"
              className="form-input w-56 text-xs"
            />
          </div>

          {keywords.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              词库为空。可以
              <a href={`/t/${tenantSlug}/keywords`} target="_blank" className="mx-1 text-foreground underline">
                打开关键词词库
              </a>
              添加;或跳过此步(不植入也可以继续)。
            </div>
          ) : (
            <KeywordGroupedPicker
              keywords={filteredKw}
              groups={groups}
              picked={pickedKeywords}
              setPicked={setPickedKeywords}
            />
          )}

          <p className="text-[11px] text-muted-foreground">
            提示:关键词不是越多越好。建议挑 3-8 个紧扣主题的长尾词,过多会被 AI 当成堆砌。
          </p>

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
            >
              ← 上一步
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-md border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              下一步:选写作要求 →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 rounded-md border border-border bg-card p-5">
          <h3 className="text-sm font-medium">第 3 步:选写作要求 + 平台</h3>

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">写作要求(意图骨架) *</span>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <label
                  key={t.id}
                  className={
                    'flex cursor-pointer items-start gap-2 rounded-md border p-3 text-xs transition ' +
                    (templateId === t.id
                      ? 'border-foreground bg-foreground/5 ring-1 ring-foreground'
                      : 'border-border hover:bg-muted/30')
                  }
                >
                  <input
                    type="radio"
                    name="tpl"
                    className="mt-0.5"
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{t.name}</span>
                      {t.is_system && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 text-[10px] text-blue-700">
                          系统
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <div className="mt-0.5 text-muted-foreground">{t.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">目标平台 *</span>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {PLATFORMS.map((p) => (
                <label
                  key={p.value}
                  className={
                    'flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 text-xs transition ' +
                    (platform === p.value
                      ? 'border-foreground bg-foreground/5 ring-1 ring-foreground'
                      : 'border-border hover:bg-muted/30')
                  }
                >
                  <input
                    type="radio"
                    name="plat"
                    className="sr-only"
                    checked={platform === p.value}
                    onChange={() => setPlatform(p.value)}
                  />
                  <span className="font-medium">{p.label}</span>
                  <span className="text-[11px] text-muted-foreground">{p.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <SummaryCard
            topic={topic}
            audience={audience}
            templateName={templates.find((t) => t.id === templateId)?.name ?? '(未选)'}
            platform={PLATFORMS.find((p) => p.value === platform)?.label ?? ''}
            keywordCount={pickedKeywords.size}
            docCount={pickedDocs.size}
          />

          {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={pending}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              ← 上一步
            </button>
            <button
              type="button"
              disabled={!canFinish || pending}
              onClick={submit}
              className="rounded-md border border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? '正在 AI 起草…(30-50 秒)' : '✦ 开始起草'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({
  step,
  setStep,
  step1Valid,
}: {
  step: 1 | 2 | 3;
  setStep: (n: 1 | 2 | 3) => void;
  step1Valid: boolean;
}) {
  const steps = ['确定参考资料', '植入关键词', '选写作要求'];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = n === step;
        const done = n < step;
        // WIZ-3 — only let users jump back to a step they've already
        // visited (done) or the active one. Forward-skipping (e.g. n=3
        // from step 1) would bypass step1 validation.
        const canJump = done || active;
        // Disable jumping to step 2/3 when step 1 isn't valid yet — protects
        // backward jump if user clears topic/audience while on step 3.
        const blockedByValidation = n > 1 && !step1Valid;
        const enabled = canJump && !blockedByValidation;
        return (
          <li key={i} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!enabled}
              onClick={() => enabled && setStep(n)}
              className={
                'inline-flex h-6 w-6 items-center justify-center rounded-full ' +
                (done
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                  : active
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground') +
                (enabled ? ' cursor-pointer' : ' cursor-not-allowed opacity-60')
              }
              title={
                blockedByValidation
                  ? '请先在第 1 步填写主题和受众'
                  : enabled
                    ? `跳到「${label}」`
                    : '不能向前跳跃,请按顺序进行'
              }
            >
              {done ? '✓' : n}
            </button>
            <span className={active ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
            {n < 3 && <span className="mx-1 h-px w-4 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryCard({
  topic,
  audience,
  templateName,
  platform,
  keywordCount,
  docCount,
}: {
  topic: string;
  audience: string;
  templateName: string;
  platform: string;
  keywordCount: number;
  docCount: number;
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs">
      <div className="mb-1 font-medium text-muted-foreground">起草任务摘要</div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3">
        <li><span className="text-muted-foreground">主题:</span> {topic || '—'}</li>
        <li><span className="text-muted-foreground">受众:</span> {audience || '—'}</li>
        <li><span className="text-muted-foreground">写作要求:</span> {templateName}</li>
        <li><span className="text-muted-foreground">目标平台:</span> {platform}</li>
        <li><span className="text-muted-foreground">关键词:</span> {keywordCount} 个</li>
        <li><span className="text-muted-foreground">手动勾选素材:</span> {docCount} 篇(优先纳入,RAG 补足空位)</li>
      </ul>
    </div>
  );
}

/**
 * WIZ-2 — group-organized keyword picker. Each group becomes a collapsible
 * block with "全选 / 清空本组" shortcuts. Keywords without a group land in
 * a virtual "未分组" block at the end. Filter applies before grouping.
 */
function KeywordGroupedPicker({
  keywords,
  groups,
  picked,
  setPicked,
}: {
  keywords: WizardKeyword[];
  groups: WizardGroup[];
  picked: Set<string>;
  setPicked: (next: Set<string>) => void;
}) {
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const buckets = new Map<string, { name: string; items: WizardKeyword[] }>();
  for (const k of keywords) {
    const key = k.group_id ?? '__none__';
    if (!buckets.has(key)) {
      const name =
        k.group_id === null ? '未分组' : (groupNameById.get(k.group_id) ?? '未分组');
      buckets.set(key, { name, items: [] });
    }
    buckets.get(key)!.items.push(k);
  }

  // Order: groups in definition order, "未分组" last.
  const orderedKeys: string[] = [];
  for (const g of groups) if (buckets.has(g.id)) orderedKeys.push(g.id);
  if (buckets.has('__none__')) orderedKeys.push('__none__');

  const togglePick = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const selectAllInGroup = (ids: string[]) => {
    const next = new Set(picked);
    for (const id of ids) next.add(id);
    setPicked(next);
  };
  const clearGroup = (ids: string[]) => {
    const next = new Set(picked);
    for (const id of ids) next.delete(id);
    setPicked(next);
  };

  if (orderedKeys.length === 0) {
    return <div className="text-xs text-muted-foreground">没有匹配结果</div>;
  }

  return (
    <div className="max-h-96 space-y-3 overflow-auto rounded-md border border-border bg-muted/20 p-3">
      {orderedKeys.map((key) => {
        const bucket = buckets.get(key)!;
        const ids = bucket.items.map((i) => i.id);
        const pickedInGroup = ids.filter((id) => picked.has(id)).length;
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {bucket.name}{' '}
                <span className="text-muted-foreground">({bucket.items.length})</span>
                {pickedInGroup > 0 && (
                  <span className="ml-1 text-emerald-700">· 已选 {pickedInGroup}</span>
                )}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => selectAllInGroup(ids)}
                >
                  全选本组
                </button>
                {pickedInGroup > 0 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => clearGroup(ids)}
                  >
                    清空本组
                  </button>
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bucket.items.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => togglePick(k.id)}
                  className={
                    'rounded-full px-3 py-1 text-xs transition ' +
                    (picked.has(k.id)
                      ? 'border border-foreground bg-foreground text-background'
                      : 'border border-border bg-card hover:bg-muted')
                  }
                >
                  {k.text}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
