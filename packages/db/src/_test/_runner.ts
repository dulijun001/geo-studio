/**
 * Test runner hardening shared across smoke tests.
 *
 * Without this, an `await` failure inside a setTimeout callback / pg pool
 * 'error' event / unawaited promise prints a 200-line pg connection object
 * dump instead of the real error message. That happened in V1.9 with
 * content-flow / compliance-llm / variant-flow simultaneously.
 *
 * Usage at the top of a test file:
 *   import { setupTestGuard } from './_runner';
 *   setupTestGuard({ timeoutMs: 60_000 });
 */

type GuardOptions = {
  /** Hard kill after this many ms. Default: no timeout. */
  timeoutMs?: number;
};

let installed = false;

export function setupTestGuard(opts: GuardOptions = {}): void {
  if (installed) return;
  installed = true;

  process.on('unhandledRejection', (reason: unknown) => {
    const stack = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    console.error('UNHANDLED REJECTION:', stack);
    process.exit(1);
  });

  process.on('uncaughtException', (err: Error) => {
    console.error('UNCAUGHT EXCEPTION:', err.stack ?? err.message);
    process.exit(1);
  });

  if (opts.timeoutMs && opts.timeoutMs > 0) {
    const t = setTimeout(() => {
      console.error(`TEST TIMED OUT after ${opts.timeoutMs}ms`);
      process.exit(1);
    }, opts.timeoutMs);
    t.unref();
  }
}
