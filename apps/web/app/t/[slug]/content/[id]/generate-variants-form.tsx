'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enqueueVariantGenerate } from './actions';

const PLATFORMS = [
  { id: 'toutiao_article', label: '今日头条号' },
  { id: 'douyin_script', label: '抖音脚本' },
  { id: 'wechat_mp', label: '公众号' },
  { id: 'zhihu', label: '知乎' },
  { id: 'xiaohongshu', label: '小红书' },
  { id: 'baijiahao', label: '百家号' },
] as const;
type Platform = (typeof PLATFORMS)[number]['id'];

export function GenerateVariantsForm({
  tenantSlug,
  contentItemId,
  disabled,
  disabledReason,
}: {
  tenantSlug: string;
  contentItemId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
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
            选择目标平台,Worker 会按 GEO 9 法(统计+引用+流畅度+权威引语)改写,并自动过合规三道门。
          </p>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0}
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? '入队中…' : `生成 ${selected.size} 个变体`}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => {
          const on = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p.id)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                on
                  ? 'bg-foreground text-background'
                  : 'border border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {message && <p className="text-xs text-emerald-700">{message}</p>}
    </div>
  );
}
