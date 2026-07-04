'use client';

/** 员工端错误边界(docs/12 P0-1)。移动端场景,文案更短,动作更大。 */
import { useEffect } from 'react';

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[staff-error-boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-4xl">📶</p>
      <h2 className="text-base font-semibold text-foreground">页面没加载出来</h2>
      <p className="text-sm text-muted-foreground">可能是网络不稳,点一下重试。</p>
      <button
        onClick={() => reset()}
        className="w-full max-w-xs rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black active:opacity-80"
      >
        重试
      </button>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/70">错误编号:{error.digest}</p>
      ) : null}
    </div>
  );
}
