/** Constants that are shared across web and worker. */

/** Audit log retention period (years). Aligned with 医疗广告法 litigation timeline. */
export const AUDIT_LOG_RETENTION_YEARS = 3;

/** Default daily quota for a tracking account (how many questions per day). */
export const DEFAULT_TRACKING_DAILY_QUOTA = 50;

/** SLA for manual compliance review before dispatch can proceed. */
export const MANUAL_REVIEW_SLA_HOURS = 4;

/** Engine refresh cadence (how often we re-ask the same question). */
export const TRACKING_REFRESH_INTERVAL_HOURS = 4;

/** Default question pool priority (0-10). */
export const DEFAULT_QUESTION_PRIORITY = 5;

/** Vector embedding dimensions (doubao-embedding / text-embedding-3-small). */
export const EMBEDDING_DIM = 1536;
