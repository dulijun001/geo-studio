'use client';

import { useState } from 'react';
import { pushWeComProgressDigestAction } from './actions';

export function WeComDigestButton({ tenantSlug }: { tenantSlug: string }) {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handlePush = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await pushWeComProgressDigestAction(tenantSlug);
      setStatusMsg(res.message);
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : '推送失败');
      setTimeout(() => setStatusMsg(null), 3500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={handlePush}
        disabled={loading}
        title="立即将当前发稿与打卡进度（谁发了、谁没发）推送到企业微信群"
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition"
      >
        <span>{loading ? '⏳ 推送中...' : '📣 推送打卡进度到企微'}</span>
      </button>
      {statusMsg && (
        <span className="absolute -bottom-6 right-0 whitespace-nowrap rounded bg-popover px-2 py-0.5 text-[11px] text-foreground shadow border border-border">
          {statusMsg}
        </span>
      )}
    </div>
  );
}
