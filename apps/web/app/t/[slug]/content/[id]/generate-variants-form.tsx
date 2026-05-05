'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enqueueVariantGenerate } from './actions';

const PLATFORMS = [
  { id: 'toutiao_article', label: '今日头条号', defaultOn: true },
  { id: 'xiaohongshu', label: '小红书', defaultOn: true },
  { id: 'douyin_script', label: '抖音脚本', defaultOn: true },
  { id: 'douyin_image_text', label: '抖音图文', defaultOn: false },
  { id: 'zhihu', label: '知乎', defaultOn: true },
  { id: 'wechat_mp', label: '公众号', defaultOn: true },
  { id: 'baijiahao', label: '百家号', defaultOn: false },
  { id: 'souhu', label: '搜狐号', defaultOn: false },
] as const;
type Platform = (typeof PLATFORMS)[number]['id'];

const DEFAULT_PLATFORMS = new Set<Platform>(
  PLATFORMS.filter((p) => p.defaultOn).map((p) => p.id),
);

export function GenerateVariantsForm({
  tenantSlug,
  contentItemId,
  existingCounts,
  disabled,
  disabledReason,
}: {
  tenantSlug: string;
  contentItemId: string;
  /** VAR-2 — count of active variants per platform for this content_item. */
  existingCounts?: Record<string, number>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  // Default-select the 5 common platforms — operator usually wants all of
  // them, and an empty default forces an extra click that surprises new users.
  const [selected, setSelected] = useState<Set<Platform>>(new Set(DEFAULT_PLATFORMS));
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: Platform) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) {
      setError('请至少选择一个平台。');
      return;
    }
    // VAR-2 — confirm before re-generating on platforms that already have
    // variants. Repeated runs append rather than replace, and operators
    // routinely click "生成" twice not realizing they're stacking copies.
    const dupes = Array.from(selected).filter((p) => (existingCounts?.[p] ?? 0) > 0);
    if (dupes.length > 0) {
      const lines = dupes
        .map((p) => `  · ${PLATFORMS.find((x) => x.id === p)?.label ?? p}:已有 ${existingCounts![p]} 条`)
        .join('\n');
      const ok = confirm(
        `以下平台已有变体,继续会再追加(不会替换旧变体):\n${lines}\n\n` +
          `如果想替换旧的,请先到下方「已生成变体」里删除/归档。\n\n继续生成?`,
      );
      if (!ok) return;
    }
    setError(null);
    setMessage(null);
    start(async () => {
      try {
        await enqueueVariantGenerate(tenantSlug, contentItemId, Array.from(selected));
        setMessage(
          `已入队 ${selected.size} 个平台的变体生成任务。Worker 处理完会自动进入合规审查。`,
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (disabled) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        {disabledReason ?? '当前状态不支持生成变体。'}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">生成平台变体</p>
          <p className="text-xs text-muted-foreground">
            勾选要发布的平台 → 点生成 → AI 按 GEO 9 法改写并自动过合规。每条 30-60 秒,
            生成完会出现在下方「已生成变体」(可能需要刷新页面)。
          </p>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0}
          className="shrink-0 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? '入队中…' : `生成 ${selected.size} 条`}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => {
          const on = selected.has(p.id);
          const existing = existingCounts?.[p.id] ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p.id)}
              title={existing > 0 ? `该平台已有 ${existing} 条变体,再生成会追加` : ''}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                on
                  ? 'bg-foreground text-background'
                  : 'border border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {p.label}
              {existing > 0 && (
                <span
                  className={
                    'ml-1 inline-block min-w-[1.25rem] rounded-full px-1 text-[10px] ' +
                    (on
                      ? 'bg-background/20 text-background'
                      : 'bg-amber-100 text-amber-800')
                  }
                >
                  {existing}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {message && <p className="text-xs text-emerald-700">{message}</p>}
    </div>
  );
}
