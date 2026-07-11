import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { vocabTypeEnum } from './brands';
import { publishTasks } from './publish';
import { pk, tenantFk, timestamps } from './_shared';

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
});

export const engineEnum = pgEnum('engine', [
  'doubao',
  'yuanbao',
  'quark',
  'deepseek',
  'kimi',
  'wenxin',
  'qwen',
  'chatgpt',
  'perplexity',
]);

export const questionIntentEnum = pgEnum('question_intent', [
  'local_recommendation',
  'price_inquiry',
  'procedure_info',
  'doctor_review',
  'comparison',
  'risk_concern',
  'aftercare',
  'other',
]);

export const snapshotStatusEnum = pgEnum('snapshot_status', [
  'pending',
  'running',
  'done',
  'failed',
  'rate_limited',
]);

export const sentimentEnum = pgEnum('sentiment', ['positive', 'neutral', 'negative']);

export const trackingAccountStatusEnum = pgEnum('tracking_account_status', [
  'active',
  'rate_limited',
  'banned',
  'retired',
]);

export const questions = pgTable(
  'questions',
  {
    id: pk(),
    tenant_id: tenantFk(),
    /** null = tenant-level generic question (all brands) */
    brand_id: uuid('brand_id'),
    text: text('text').notNull(),
    intent: questionIntentEnum('intent').notNull().default('other'),
    city: text('city'),
    category: text('category'),
    priority: integer('priority').notNull().default(5),
    embedding: vector('embedding'),
    active: boolean('active').notNull().default(true),
    /**
     * V1.12 D31 子问题展开:
     * - parent_id IS NULL → 主题题(原 questions 默认)
     * - parent_id IS NOT NULL → 由父题展开的子问题。daily-ops cron 优先选
     *   子问题以提高豆包 RAG 关键词命中率(报告 §3.3 r=0.23 唯一显著因子)
     */
    parent_id: uuid('parent_id'),
    /** manual / llm_expand / imported / feedback_loop */
    subtopic_source: text('subtopic_source'),
    /** LLM 展开时的种子文本(通常是父题的 text) */
    expansion_seed_topic: text('expansion_seed_topic'),
    ...timestamps(),
  },
  (t) => ({
    tenant_active_idx: index('questions_tenant_active_idx').on(t.tenant_id, t.active),
    priority_idx: index('questions_priority_idx').on(t.tenant_id, t.priority),
  }),
);

export const trackingAccounts = pgTable('tracking_accounts', {
  id: pk(),
  engine: engineEnum('engine').notNull(),
  nickname: text('nickname').notNull(),
  /** Reference to credential vault (never plaintext). */
  credential_ref: text('credential_ref').notNull(),
  daily_quota: integer('daily_quota').notNull().default(50),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  status: trackingAccountStatusEnum('status').notNull().default('active'),
  ...timestamps(),
});

export const geoSnapshots = pgTable(
  'geo_snapshots',
  {
    id: pk(),
    tenant_id: tenantFk(),
    question_id: uuid('question_id').notNull(),
    engine: engineEnum('engine').notNull(),
    session_account_id: uuid('session_account_id'),
    asked_at: timestamp('asked_at', { withTimezone: true }),
    raw_response: text('raw_response'),
    citation_urls: text('citation_urls').array().notNull().default([]),
    status: snapshotStatusEnum('status').notNull().default('pending'),
    failure_reason: text('failure_reason'),
    /** V1.13 (0045) — adapter 诊断维度落库(D29):sources_expander / sources_error 等,前端据此区分引用 0 的语义 */
    meta: jsonb('meta').notNull().default({}),
    ...timestamps(),
  },
  (t) => ({
    question_time_idx: index('geo_snapshots_question_time_idx').on(t.question_id, t.asked_at),
    tenant_engine_idx: index('geo_snapshots_tenant_engine_idx').on(t.tenant_id, t.engine),
    status_idx: index('geo_snapshots_status_idx').on(t.status),
  }),
);

/**
 * One row per brand-vocab mention found in a snapshot's raw_response.
 * `vocab_id` + `term_type` are denormalized from brand_vocab so SOV queries
 * don't need a join. `brand_mentioned` is legacy (always true under the W6
 * model) and stays only for backward compat with earlier seeds.
 */
export const citations = pgTable(
  'citations',
  {
    id: pk(),
    tenant_id: tenantFk(),
    snapshot_id: uuid('snapshot_id').notNull(),
    brand_mentioned: boolean('brand_mentioned').notNull(),
    mention_position: integer('mention_position'),
    mention_text: text('mention_text'),
    /** FK to brand_vocab.id; nullable so deleting a vocab row doesn't lose history. */
    vocab_id: uuid('vocab_id'),
    term_type: vocabTypeEnum('term_type'),
    matched_task_id: uuid('matched_task_id'),
    match_confidence: doublePrecision('match_confidence'),
    sentiment: sentimentEnum('sentiment'),
    ...timestamps(),
  },
  (t) => ({
    snapshot_idx: index('citations_snapshot_idx').on(t.snapshot_id),
    snapshot_term_idx: index('citations_term_type_idx').on(t.snapshot_id, t.term_type),
    vocab_idx: index('citations_vocab_idx')
      .on(t.vocab_id)
      .where(sql`vocab_id IS NOT NULL`),
    matched_task_idx: index('citations_matched_task_idx')
      .on(t.matched_task_id)
      .where(sql`matched_task_id IS NOT NULL`),
  }),
);

export const questionsRelations = relations(questions, ({ many }) => ({
  snapshots: many(geoSnapshots),
}));

export const geoSnapshotsRelations = relations(geoSnapshots, ({ one, many }) => ({
  question: one(questions, {
    fields: [geoSnapshots.question_id],
    references: [questions.id],
  }),
  account: one(trackingAccounts, {
    fields: [geoSnapshots.session_account_id],
    references: [trackingAccounts.id],
  }),
  citations: many(citations),
}));

export const citationsRelations = relations(citations, ({ one }) => ({
  snapshot: one(geoSnapshots, {
    fields: [citations.snapshot_id],
    references: [geoSnapshots.id],
  }),
  matchedTask: one(publishTasks, {
    fields: [citations.matched_task_id],
    references: [publishTasks.id],
  }),
}));

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type GeoSnapshot = typeof geoSnapshots.$inferSelect;
export type NewGeoSnapshot = typeof geoSnapshots.$inferInsert;
export type Citation = typeof citations.$inferSelect;
export type TrackingAccount = typeof trackingAccounts.$inferSelect;
