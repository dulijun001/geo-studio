/**
 * Minimal observability abstraction — same interface across web + worker, so
 * callers don't have to know whether they're running in Next.js, in a node
 * worker, or in a test.
 *
 * V1: structured console output. console.error gets a `[severity=error]`
 * tagged JSON line that's grepable in Vercel function logs / Railway logs /
 * journalctl on ECS.
 *
 * V2 (production): swap the implementation to call @sentry/node's
 * captureException(). The function signatures stay the same so no caller
 * changes. Sentry SDK is intentionally not installed yet — it pulls a heavy
 * dependency tree and we don't want it gating the dev install.
 */

export type ErrorContext = {
  /** Free-form tag that bins related errors together — e.g. "compliance.review", "tracker.doubao". */
  scope?: string;
  /** Tenant the error belongs to, when known — lets us filter per-customer. */
  tenant_id?: string;
  /** User the error was caused by, when known. */
  user_id?: string;
  /** Anything else useful for debugging — request_id, payload preview, etc. */
  extra?: Record<string, unknown>;
};

export function reportError(err: unknown, context: ErrorContext = {}): void {
  const payload = {
    severity: 'error',
    ts: new Date().toISOString(),
    scope: context.scope ?? 'unknown',
    tenant_id: context.tenant_id ?? null,
    user_id: context.user_id ?? null,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    extra: context.extra ?? {},
  };
  // Single-line JSON so log aggregators pick it up cleanly.
  console.error(JSON.stringify(payload));

  // When @sentry/node lands:
  //   import * as Sentry from '@sentry/node';
  //   Sentry.captureException(err, { tags: { scope: context.scope }, extra: { ... } });
}

export function reportEvent(
  name: string,
  context: ErrorContext = {},
): void {
  const payload = {
    severity: 'info',
    ts: new Date().toISOString(),
    event: name,
    scope: context.scope ?? 'unknown',
    tenant_id: context.tenant_id ?? null,
    user_id: context.user_id ?? null,
    extra: context.extra ?? {},
  };
  console.log(JSON.stringify(payload));
}
