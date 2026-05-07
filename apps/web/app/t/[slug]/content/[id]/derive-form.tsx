'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { deriveDraftsToOtherPlatforms } from './actions';

const TARGETS = [
  { value: 'toutiao_article', label: '头条号', desc: '资讯结构化,字节加分' },
  { value: 'douyin_script', label: '抖音脚本', desc: '60s 视频钩子' },
  { value: 'xiaohongshu', label: '小红书', desc: '痛点 + 个人化' },
  { value: 'wechat_mp', label: '公众号', desc: '深度长文' },
  { value: 'zhihu', label: '知乎', desc: '权威长文' },
] as const;

const DEFAULT_SELECTED = ['toutiao_article', 'douyin_script', 'xiaohongshu'];

export function DeriveForm({
  tenantSlug,
  contentItemId,
  parentPlatformGuess,
}: {
  tenantSlug: string;
  contentItemId: string;
  /** Don't suggest deriving to the same platform as the parent. */
  parentPlatformGuess?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(DEFAULT_SELECTED.filter((p) => p !== parentPlatformGuess)),
  );
  const [result, setResult] = useState<{
    created: Array<{ platform: string; content_item_id: string }>;
    failed: Array<{ platform: string; error: string }>;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (v: string) => {
    setSelected((s) => {
      const ns = new Set(s);
      if (ns.has(v)) ns.delete(v);
      else ns.add(v);
      return ns;
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setErr('请至少选 1 个目标平台');
      return;
    }
    setErr(null);
    setResult(null);
    start(async () => {
      try {
        const r = await deriveDraftsToOtherPlatforms(
          tenantSlug,
          contentItemId,
          Array.from(selected) as never,
        );
        setResult(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '派生失败');
      }
    });
  };

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/50 p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold">📤 一键派生其他平台</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          基于这篇已通过的内容,AI 改写为其他平台风格 → 1 篇变 5 条覆盖矩阵 ·
          保留引用源 + 不重新跑 RAG · 单平台 30-60s
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {TARGETS.map((t) => {
            const isSelf = parentPlatformGuess === t.value;
            const checked = selected.has(t.value);
            return (
              <label
                key={t.value}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${
                  isSelf
                    ? 'border-border bg-muted/40 opacity-50 cursor-not-allowed'
                    : checked
                    ? 'border-violet-400 bg-card'
                    : 'border-border bg-card hover:bg-muted/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={pending || isSelf}
                  onChange={() => !isSelf && toggle(t.value)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="font-medium">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                  {isSelf ? <p className="text-[10px] text-rose-400">(原文平台)</p> : null}
                </div>
              </label>
            );
          })}
        </div>

        {err ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-3 py-2 text-xs text-rose-300">
            {err}
          </p>
        ) : null}

        {pending ? (
          <p className="rounded-md border border-violet-200 bg-violet-100 px-3 py-2 text-xs text-violet-800">
            AI 在并行改写 {selected.size} 个平台,通常 30-90s。请勿关闭页面。
          </p>
        ) : null}

        {result ? (
          <div className="space-y-1.5">
            {result.created.length > 0 ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.10] px-3 py-2 text-xs text-emerald-200">
                ✓ 已生成 {result.created.length} 个派生草稿:
                {result.created.map((c) => (
                  <a
                    key={c.platform}
                    href={`/t/${tenantSlug}/content/${c.content_item_id}`}
                    className="ml-2 underline hover:no-underline"
                  >
                    {c.platform}
                  </a>
                ))}
              </div>
            ) : null}
            {result.failed.length > 0 ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-3 py-2 text-xs text-rose-300">
                {result.failed.length} 个失败:{' '}
                {result.failed.map((f) => `${f.platform}(${f.error})`).join(' / ')}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-between gap-2">
          <button
            type="submit"
            disabled={pending || selected.size === 0}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {pending
              ? '改写中…'
              : `生成 ${selected.size} 个派生草稿`}
          </button>
          {result && (result.created.length > 0 || result.failed.length > 0) ? (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                router.refresh();
              }}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              再来一批
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
