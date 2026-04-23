import type { Engine } from '@geo/shared';
import type { TrackerContext, TrackerQuery, TrackerResult } from './types';

/**
 * Every engine adapter implements this interface.
 * Register concrete adapters in apps/worker/src/trackers/registry.ts.
 */
export interface TrackerAdapter {
  readonly engine: Engine;

  /**
   * Execute a tracking query.
   * Implementation contract:
   *   - Never throw for expected outcomes (rate limit, captcha). Return status != 'done' instead.
   *   - Throw only for unrecoverable bugs; the worker will surface those to Sentry.
   *   - Respect ctx.timeout_ms strictly; use AbortController.
   */
  query(q: TrackerQuery, ctx: TrackerContext): Promise<TrackerResult>;
}
