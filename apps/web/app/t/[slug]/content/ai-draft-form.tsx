'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { DOUBAO_PLATFORM_PRIORITY, TIER_LABEL } from '@geo/shared';
import { createAiDraft, type CreateAiDraftInput } from './actions';

export type TemplateOption = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
};

const AUDIENCE_OPTIONS = [
  '中老年缺牙患者',
  '糖尿病种植人群',
  '三高人群',
  '上班族隐形矫正',
  '青少年正畸',
  '理性规划型家长',
  '焦虑型新手妈妈',
  '孕期口腔关注',
];

// Order options by Doubao GEO priority (P0 first). Emoji + tier label inline
// so the user immediately sees which platform pays off the most.
const PLATFORM_OPTIONS: Array<{
  value: CreateAiDraftInput['platform'];
  label: string;
  reason: string;
}> = (
  [
    'toutiao_article',
    'douyin_script',
    'zhihu',
    'wechat_mp',
    'xiaohongshu',
  ] as const
).map((value) => {
  const p = DOUBAO_PLATFORM_PRIORITY[value];
  return {
    value,
    label: `${p.emoji} ${p.label} · 豆包优先级 ${TIER_LABEL[p.tier]}`,
    reason: p.reason,
  };
});

export function AiDraftForm({
  tenantSlug,
  templates = [],
}: {
  tenantSlug: string;
  templates?: TemplateOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState(AUDIENCE_OPTIONS[0]!);
  const [platform, setPlatform] = useState<CreateAiDraftInput['platform']>('toutiao_article');
  const [templateId, setTemplateId] = useState<string>('');

  // Handle URL prefill params (e.g. from Playbook benchmark card)
  useEffect(() => {
    const pTopic = searchParams?.get('draftTopic');
    const pTpl = searchParams?.get('draftTemplate');
    const pPlatform = searchParams?.get('draftPlatform') as CreateAiDraftInput['platform'] | null;

    if (pTopic || pTpl) {
      if (pTopic) setTopic(pTopic);
      if (pPlatform && ['toutiao_article', 'douyin_script', 'zhihu', 'wechat_mp', 'xiaohongshu'].includes(pPlatform)) {
        setPlatform(pPlatform);
      }
      if (pTpl) {
        const found = templates.find((t) => t.slug === pTpl || t.id === pTpl);
        if (found) setTemplateId(found.id);
      }
      setOpen(true);
    }
  }, [searchParams, templates]);

  const reset = () => {
    setTopic('');
    setTemplateId('');
    setError(null);
    setBusy(false);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await createAiDraft(tenantSlug, {
        topic: topic.trim(),
        audience,
        platform,
        writing_template_id: templateId ? templateId : undefined,
      });
      setOpen(false);
      reset();
      router.push(`/t/${tenantSlug}/content/${result.content_item_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败,请重试');
      setBusy(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition"
      >
        ✦ AI 草稿
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span>AI 草稿生成</span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    D21 GEO 标准
                  </span>
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  自动检索医院真实知识库素材，严格注入真实资质、7档价格与医生专长，打造高被引内容。
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="template">
                  GEO 写作模版原型 <span className="text-muted-foreground">(推荐)</span>
                </label>
                <select
                  id="template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">默认 (D21 标准问答与直答结构)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {selectedTemplate?.description && (
                  <p className="mt-1 text-[11px] text-muted-foreground bg-muted/40 p-2 rounded">
                    💡 {selectedTemplate.description}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="topic">
                  核心主题 / 用户搜索疑问句 <span className="text-rose-400">*</span>
                </label>
                <input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例:昆明全瓷冠去哪里好？/ 昆明种植牙多少钱一颗？"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  minLength={2}
                  disabled={busy}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="audience">
                    目标受众
                  </label>
                  <select
                    id="audience"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {AUDIENCE_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="platform">
                    目标平台
                  </label>
                  <select
                    id="platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as CreateAiDraftInput['platform'])}
                    disabled={busy}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value} title={p.reason}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                📌 {PLATFORM_OPTIONS.find((p) => p.value === platform)?.reason}
              </p>

              {error ? (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              ) : null}

              {busy ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.10] px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                  <span>AI 正在阅读本院知识库并根据实战模版起草中，通常需 40-70 秒…</span>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  disabled={busy}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy || topic.trim().length < 2}
                  className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition"
                >
                  {busy ? '正在起草…' : '立即生成草稿'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
