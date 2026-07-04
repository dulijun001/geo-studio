'use client';

/**
 * 租户后台错误边界(docs/12 P0-1,2026-07-04)。
 * 此前全应用 0 个 error.tsx — 任何 RSC 数据错误(Supabase 断连 / ARK 欠费,
 * 已发生 4 次)都变成 Next 默认英文白屏,无重试无退路。
 */
import { useEffect } from 'react';

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[tenant-error-boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-4xl">😵‍💫</p>
      <h2 className="text-lg font-semibold text-foreground">这个页面刚才没加载出来</h2>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        通常是网络抖动或后台服务瞬时不可用,点下面重试一次基本就好;反复出现的话,把下方错误编号发给技术支持。
      </p>
      <button
        onClick={() => reset()}
        className="rounded-md bg-emerald-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400"
      >
        重试
      </button>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/70">错误编号:{error.digest}</p>
      ) : null}
    </div>
  );
}
