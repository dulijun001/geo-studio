/**
 * Observability abstraction — same interface across web + worker.
 *
 * V1.11.3 (2026-05-21): @sentry/node 真接通。SENTRY_DSN 设了 → captureException;
 * 设空(测试 / 早期 dev)→ 退回 V1 的结构化 JSON console.error,保留语义不变。
 * 调用方 26 处无须任何改动。
 *
 * 设计纪律:
 * - lazy init (ensureSentry 在第一次调用 reportError/reportEvent 时跑)。worker
 *   和 web 入口都不强制 import 这里,避免在 SENTRY_DSN 缺失时仍 ship 重量级
 *   @sentry/node 模块到无监控环境
 * - 同步路径不能因为 Sentry 出问题而抛 — 任何 Sentry 内部异常都吞掉,只保
 *   留 console.error 后备路径
 * - reportEvent 当 breadcrumb 用 (Sentry 的 addBreadcrumb),不发独立 event
 *   — 否则免费额度 1 周就爆
 */

// @sentry/node 含 child_process / fs 等 node-only deps,Next.js client bundle
// 静态分析会失败。用字符串变量 + webpackIgnore 让 webpack 跳过 — 仅在
// 真正调用 ensureSentry 的 node 进程(web SSR / worker)里运行时载入。
type SentryLike = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, ctx?: Record<string, unknown>) => void;
  addBreadcrumb: (b: Record<string, unknown>) => void;
};

export type ErrorContext = {
  /** 业务区域标签 — "compliance.review", "tracker.doubao" 等. */
  scope?: string;
  /** 所属租户. */
  tenant_id?: string;
  /** 触发的用户. */
  user_id?: string;
  /** 任意 debug 上下文. */
  extra?: Record<string, unknown>;
};

let sentryModule: SentryLike | null = null;
let initState: 'pending' | 'ready' | 'disabled' = 'pending';

async function ensureSentry(): Promise<SentryLike | null> {
  if (initState === 'ready') return sentryModule;
  if (initState === 'disabled') return null;

  // 客户端 / Edge / 其他无 node API 环境直接 disabled — 不再尝试加载。
  if (typeof process === 'undefined' || !process.versions?.node) {
    initState = 'disabled';
    return null;
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn || dsn.trim().length === 0) {
    initState = 'disabled';
    return null;
  }

  try {
    // 字符串变量 + webpackIgnore: webpack 静态分析时跳过这个 import,
    // 留给真正的 Node.js runtime 处理。
    const sentryModuleName = '@sentry/node';
    const mod = (await import(/* webpackIgnore: true */ sentryModuleName)) as SentryLike;
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'production',
      release: process.env.GIT_SHA ?? undefined,
      // tracesSampleRate=0:不发 transaction performance,只发 error。免费额度
      // 50k events/month,V1 单客户大概 1k-3k err/month,够用。
      tracesSampleRate: 0,
    });
    sentryModule = mod;
    initState = 'ready';
    return mod;
  } catch (err) {
    // Sentry 包装错误也不能让 reportError 自身抛。退到 disabled。
    console.error(
      JSON.stringify({
        severity: 'error',
        ts: new Date().toISOString(),
        scope: 'observability.init',
        message: `Sentry init failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
    initState = 'disabled';
    return null;
  }
}

function logToConsole(payload: Record<string, unknown>, severity: 'error' | 'info'): void {
  const line = JSON.stringify({ severity, ts: new Date().toISOString(), ...payload });
  if (severity === 'error') console.error(line);
  else console.log(line);
}

export function reportError(err: unknown, context: ErrorContext = {}): void {
  const payload = {
    scope: context.scope ?? 'unknown',
    tenant_id: context.tenant_id ?? null,
    user_id: context.user_id ?? null,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    extra: context.extra ?? {},
  };
  // 同步先写 console — 即使 Sentry 还在 lazy init,日志已经落地。
  logToConsole(payload, 'error');

  // 异步推 Sentry。不 await — caller 不该等远程 IO。
  ensureSentry()
    .then((mod) => {
      if (!mod) return;
      try {
        mod.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: {
            scope: context.scope ?? 'unknown',
            ...(context.tenant_id ? { tenant_id: context.tenant_id } : {}),
          },
          user: context.user_id ? { id: context.user_id } : undefined,
          extra: context.extra,
        });
      } catch {
        // Sentry SDK 自己挂了 — 已经 console.error 过,不二次抛
      }
    })
    .catch(() => {
      /* ensureSentry 内部已 logToConsole,这里只是吞 unhandled rejection */
    });
}

export function reportEvent(name: string, context: ErrorContext = {}): void {
  const payload = {
    event: name,
    scope: context.scope ?? 'unknown',
    tenant_id: context.tenant_id ?? null,
    user_id: context.user_id ?? null,
    extra: context.extra ?? {},
  };
  logToConsole(payload, 'info');

  // event 不发 Sentry 独立 event — 降为 breadcrumb,跟在下一个 reportError 上
  // 一起被 capture。免费额度保护。
  ensureSentry()
    .then((mod) => {
      if (!mod) return;
      try {
        mod.addBreadcrumb({
          category: context.scope ?? 'unknown',
          message: name,
          level: 'info',
          data: { tenant_id: context.tenant_id, ...context.extra },
        });
      } catch {
        /* 同 reportError 的吞策略 */
      }
    })
    .catch(() => undefined);
}
