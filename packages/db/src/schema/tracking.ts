import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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
    ...timestamps(),
  },
  (t) => ({
    question_time_idx: index('geo_snapshots_question_time_idx').on(t.question_id, t.asked_at),
    tenant_engine_idx: index('geo_snapshots_tenant_engine_idx').on(t.tenant_id, t.engine),
    status_idx: index('geo_snapshots_status_idx').on(t.status),
  }),
);

export const citations = pgTable(
  'citations',
  {
    id: pk(),
    tenant_id: tenantFk(),
    snapshot_id: uuid('snapshot_id').notNull(),
    brand_mentioned: boolean('brand_mentioned').notNull(),
    mention_position: integer('mention_position'),
    mention_text: text('mention_text'),
    matched_task_id: uuid('matched_task_id'),
    match_confidence: doublePrecision('match_confidence'),
    sentiment: sentimentEnum('sentiment'),
    ...timestamps(),
  },
  (t) => ({
    snapshot_idx: index('citations_snapshot_idx').on(t.snapshot_id),
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
