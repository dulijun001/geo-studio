'use client';

import { useState, useTransition } from 'react';
import {
  setPublicEnabled,
  triggerRegenerate,
  triggerSearchPush,
  saveSearchPushSettings,
} from './actions';
import type { UnifiedPushSummary } from '@geo/geo-core';

/**
 * Public-enable toggle + URL preview banner.
 *
 * When enabled, shows the four public URLs (so admins can verify in a browser
 * before sharing the links with customers / pasting them into 微信 etc.).
 */
export function PublicToggle({
  tenantSlug,
  enabled,
  publicUrls,
}: {
  tenantSlug: string;
  enabled: boolean;
  publicUrls: { llms: string; llmsFull: string; feed: string; sitemap: string };
}) {
  const [isPending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onToggle = () => {
    setErr(null);
    start(async () => {
      try {
        await setPublicEnabled(tenantSlug, !enabled);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '切换失败');
      }
    });
  };

  return (
    <div
      className={`rounded-md border p-4 ${
        enabled
          ? 'border-emerald-500/30 bg-emerald-500/[0.10]/60'
          : 'border-amber-500/30 bg-amber-500/[0.10]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                enabled ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="text-sm font-medium">
              {enabled ? '公开访问已开启' : '公开访问关闭'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {enabled
              ? '4 个 artifact 对豆包 / 元宝 / Perplexity 等 AI 爬虫公开可读'
              : '关闭状态下,公开 URL 一律返回 404 — 客户没准备好之前不会泄露'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={isPending}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition disabled:opacity-50 ${
            enabled ? 'bg-emerald-500' : 'bg-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 translate-y-[-1px] transform rounded-full bg-white shadow ring-0 transition ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {err && (
        <div className="mt-3 text-xs text-rose-300">{err}</div>
      )}

      {enabled && (
        <div className="mt-3 grid grid-cols-1 gap-1 text-xs lg:grid-cols-2">
          <PublicUrlRow label="llms.txt" url={publicUrls.llms} />
          <PublicUrlRow label="llms-full.txt" url={publicUrls.llmsFull} />
          <PublicUrlRow label="feed.json" url={publicUrls.feed} />
          <PublicUrlRow label="sitemap.xml" url={publicUrls.sitemap} />
        </div>
      )}
    </div>
  );
}

function PublicUrlRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center gap-2 truncate">
      <span className="w-24 shrink-0 font-mono text-muted-foreground">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="truncate font-mono text-foreground/80 underline-offset-2 hover:underline"
      >
        {url}
      </a>
    </div>
  );
}

/**
 * "立即重建" — enqueue worker job for this tenant.
 */
export function RegenerateButton({ tenantSlug }: { tenantSlug: string }) {
  const [isPending, start] = useTransition();
  const [done, setDone] = useState<'idle' | 'enqueued' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    setErr(null);
    setDone('idle');
    start(async () => {
      try {
        await triggerRegenerate(tenantSlug);
        setDone('enqueued');
        setTimeout(() => setDone('idle'), 4000);
      } catch (e) {
        setDone('error');
        setErr(e instanceof Error ? e.message : '重建失败');
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {isPending ? '重建中…' : '立即重建'}
      </button>
      {done === 'enqueued' && (
        <span className="text-xs text-emerald-400">✓ 已入队,worker 几秒内处理</span>
      )}
      {err && <span className="text-xs text-rose-300">{err}</span>}
    </div>
  );
}

/**
 * 2026 GEO 闭环：百度搜索资源平台 & 神马站长平台 主动收录推送面板
 */
export function SearchPushPanel({
  tenantSlug,
  initialConfig,
}: {
  tenantSlug: string;
  initialConfig: {
    baidu_site?: string;
    baidu_token_masked?: string;
    shenma_site?: string;
    shenma_username?: string;
    shenma_key_masked?: string;
  };
}) {
  const [isPending, start] = useTransition();
  const [showConfig, setShowConfig] = useState(false);
  const [baiduSite, setBaiduSite] = useState(initialConfig.baidu_site ?? '');
  const [baiduToken, setBaiduToken] = useState(initialConfig.baidu_token_masked ?? '');
  const [shenmaSite, setShenmaSite] = useState(initialConfig.shenma_site ?? '');
  const [shenmaUser, setShenmaUser] = useState(initialConfig.shenma_username ?? '');
  const [shenmaKey, setShenmaKey] = useState(initialConfig.shenma_key_masked ?? '');
  const [customUrls, setCustomUrls] = useState('');
  const [pushSummary, setPushSummary] = useState<UnifiedPushSummary | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const hasBaidu = Boolean(initialConfig.baidu_site && initialConfig.baidu_token_masked);
  const hasShenma = Boolean(
    initialConfig.shenma_site && initialConfig.shenma_username && initialConfig.shenma_key_masked,
  );

  const onSaveConfig = () => {
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await saveSearchPushSettings(tenantSlug, {
        baidu_site: baiduSite,
        baidu_token: baiduToken,
        shenma_site: shenmaSite,
        shenma_username: shenmaUser,
        shenma_access_key: shenmaKey,
      });
      if (!res.ok) {
        setErr(res.error ?? '保存失败');
      } else {
        setMsg('✓ 搜索引擎推送凭据已安全保存');
        setShowConfig(false);
      }
    });
  };

  const onPushNow = () => {
    setErr(null);
    setMsg(null);
    setPushSummary(null);
    start(async () => {
      const extra = customUrls
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await triggerSearchPush(tenantSlug, extra);
      if (!res.ok) {
        setErr(res.error ?? '推送失败');
      } else if (res.summary) {
        setPushSummary(res.summary);
      }
    });
  };

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">🚀 国内搜索引擎主动收录推送 (百度 / 神马)</h3>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                hasBaidu
                  ? 'bg-emerald-500/[0.12] text-emerald-400 border border-emerald-500/30'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              百度站长: {hasBaidu ? '已就绪' : '待配置'}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                hasShenma
                  ? 'bg-emerald-500/[0.12] text-emerald-400 border border-emerald-500/30'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              神马(UC/夸克): {hasShenma ? '已就绪' : '待配置'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            员工在手机端回填发布链接时会自动异步触发推送；也可在此一键推送全量已发布文章与 Sitemap，将 AI 爬虫抓取周期缩短至小时级。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            {showConfig ? '收起凭据设置' : '⚙️ 配置 API 凭据'}
          </button>
          <button
            type="button"
            onClick={onPushNow}
            disabled={isPending}
            className="rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400 disabled:opacity-50"
          >
            {isPending ? '推送中…' : '⚡ 一键主动推送收录'}
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="rounded border border-border bg-muted/20 p-3 space-y-3 text-xs">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="font-medium text-foreground">百度搜索资源平台 (ziyuan.baidu.com)</div>
              <div>
                <label className="block text-muted-foreground mb-1">站点域名 (Site, 如 songskq.com)</label>
                <input
                  value={baiduSite}
                  onChange={(e) => setBaiduSite(e.target.value)}
                  placeholder="songskq.com"
                  className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">推送接口 Token</label>
                <input
                  value={baiduToken}
                  onChange={(e) => setBaiduToken(e.target.value)}
                  placeholder="16位站长推送 Token"
                  className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium text-foreground">阿里神马站长平台 (zhanzhang.sm.cn)</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-muted-foreground mb-1">站点域名 (Site)</label>
                  <input
                    value={shenmaSite}
                    onChange={(e) => setShenmaSite(e.target.value)}
                    placeholder="songskq.com"
                    className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1">站长账号 (UserName)</label>
                  <input
                    value={shenmaUser}
                    onChange={(e) => setShenmaUser(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">接口密钥 (AccessKey)</label>
                <input
                  value={shenmaKey}
                  onChange={(e) => setShenmaKey(e.target.value)}
                  placeholder="神马推送 Authorization Key"
                  className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-muted-foreground">附加推送 URL (可选，每行或逗号分隔一条)</label>
            <textarea
              rows={2}
              value={customUrls}
              onChange={(e) => setCustomUrls(e.target.value)}
              placeholder="https://songskq.com/article/1..."
              className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSaveConfig}
              disabled={isPending}
              className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-400"
            >
              保存凭据配置
            </button>
          </div>
        </div>
      )}

      {msg && <div className="text-xs text-emerald-400">{msg}</div>}
      {err && <div className="text-xs text-rose-300">{err}</div>}

      {pushSummary && (
        <div className="rounded border border-border bg-muted/20 p-3 text-xs space-y-1.5">
          <div className="font-medium text-foreground">
            本次共汇总待推送链接: <span className="text-sky-400">{pushSummary.urls_count}</span> 条
          </div>
          {pushSummary.baidu ? (
            <div className={pushSummary.baidu.ok ? 'text-emerald-400' : 'text-amber-300'}>
              • 百度搜索资源平台:{' '}
              {pushSummary.baidu.ok
                ? `成功推送 ${pushSummary.baidu.success ?? 0} 条 (今日剩余配额: ${pushSummary.baidu.remain ?? '-'})`
                : `${pushSummary.baidu.error}`}
            </div>
          ) : (
            <div className="text-muted-foreground">• 百度搜索资源平台: 未配置 Site/Token，已跳过调用</div>
          )}
          {pushSummary.shenma ? (
            <div className={pushSummary.shenma.ok ? 'text-emerald-400' : 'text-amber-300'}>
              • 神马站长平台(UC/夸克):{' '}
              {pushSummary.shenma.ok
                ? `推送成功 (returnCode: ${pushSummary.shenma.returnCode ?? 200})`
                : `${pushSummary.shenma.error}`}
            </div>
          ) : (
            <div className="text-muted-foreground">• 神马站长平台: 未配置凭据，已跳过调用</div>
          )}
        </div>
      )}
    </div>
  );
}

