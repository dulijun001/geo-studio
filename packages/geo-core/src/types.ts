import type { Engine } from '@geo/shared';

export type TrackerQuery = {
  /** Engine to query. Adapters MUST reject queries for other engines. */
  engine: Engine;
  /** The raw user-style question, e.g. "南京正畸推荐哪家医院?" */
  question: string;
  /** Optional city context the adapter can pass into the engine UI if it supports regional answers. */
  city?: string;
  /** Upstream tracking id for correlating logs. */
  snapshot_id: string;
};

export type TrackerResult = {
  status: 'done' | 'failed' | 'rate_limited';
  /** Full answer text. */
  raw_response?: string;
  /** URLs referenced in the answer (parsed from citation chips). */
  citation_urls?: string[];
  /** Engine-specific metadata (timing, UI fingerprint, token counts, ...). */
  meta?: Record<string, unknown>;
  /** Error detail when status !== 'done'. */
  failure_reason?: string;
};

export type TrackerContext = {
  /** Reference to a pre-authenticated tracking account (maps to tracking_accounts.id). */
  account_id: string;
  /** Proxy endpoint the adapter should route through. Null = direct. */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  /** Whether to run in headless mode (production=true, local debug=false). */
  headless: boolean;
  /** Wall-clock timeout in ms. Adapter must abort if exceeded. */
  timeout_ms: number;
};
