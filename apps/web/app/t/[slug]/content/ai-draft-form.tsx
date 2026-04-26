'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { createAiDraft, type CreateAiDraftInput } from './actions';

const AUDIENCE_OPTIONS = [
  '焦虑型新手妈妈',
  '理性规划型家长',
  '三高人群',
  '中老年缺牙患者',
  '糖尿病种植人群',
  '青少年正畸',
  '孕期口腔关注',
  '上班族隐形矫正',
];

const PLATFORM_OPTIONS: Array<{ value: CreateAiDraftInput['platform']; label: string }> = [
  { value: 'xiaohongshu', label: '小红书(短文+痛点+列表)' },
  { value: 'douyin_script', label: '抖音脚本(15s 钩子+视觉)' },
  { value: 'wechat_mp', label: '公众号(故事化长文)' },
  { value: 'zhihu', label: '知乎(权威长文+引用)' },
  { value: 'toutiao_article', label: '头条号(资讯结构化)' },
];

export function AiDraftForm({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState(AUDIENCE_OPTIONS[0]!);
  const [platform, setPlatform] = useState<CreateAiDraftInput['platform']>('xiaohongshu');

  const reset = () => {
    setTopic('');
    setError(null);
    setBusy(false);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await createAiDraft(tenantSlug, { topic: topic.trim(), audience, platform });
      setOpen(false);
      reset();
      router.push(`/t/${tenantSlug}/content/${result.content_item_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败,请重试');
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        AI 草稿
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div
            className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">AI 草稿生成</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              基于知识库素材生成,自动带引用源,生成后可改稿再走合规审核。
            </p>

            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="topic">
                  主题 <span className="text-rose-600">*</span>
                </label>
                <input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例:糖尿病人能种植牙吗"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  required
                  minLength={2}
                  disabled={busy}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="audience">
                  受众
                </label>
                <select
                  id="audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {error ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </div>
              ) : null}

              {busy ? (
                <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                  正在生成,通常 60-120 秒(平台调性 + GEO 9 法 prompt 较长)。AI 在阅读知识库 + 撰写,请稍候…
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
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
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {busy ? '生成中…' : '生成草稿'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
