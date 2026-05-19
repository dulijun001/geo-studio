'use client';

import { useState, useTransition } from 'react';
import { bulkApproveTodayGreens, type BulkApproveResult } from './actions';

export function BulkApproveButton({
  tenantSlug,
  greenCount,
}: {
  tenantSlug: string;
  greenCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkApproveResult | string | null>(null);

  const onClick = () => {
    if (!confirm(`确定一键 approve ${greenCount} 条绿色变体?`)) return;
    setResult(null);
    startTransition(async () => {
      try {
        const r = await bulkApproveTodayGreens(tenantSlug);
        setResult(r);
      } catch (err) {
        setResult(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="text-sm">
        <p className="font-medium text-emerald-300">{greenCount} 条绿色变体可一键放行</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          满足 DoD passed + 合规 auto_approved + 0 改写 + 数值核对 OK。批量 approve
          会走 compliance.bulkReview,完整 audit_log。
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
      >
        {pending ? '处理中…' : `一键 approve ${greenCount} 条`}
      </button>
      {result && typeof result === 'string' && (
        <p className="w-full text-xs text-rose-400">错误:{result}</p>
      )}
      {result && typeof result !== 'string' && (
        <p className="w-full text-xs text-muted-foreground">
          ✓ {result.succeeded}/{result.total} 已 approve
          {result.failed.length > 0 && `,${result.failed.length} 失败`}
        </p>
      )}
    </div>
  );
}
