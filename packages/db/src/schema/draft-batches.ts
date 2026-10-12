import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, tenantFk } from './_shared';

export const draftBatches = pgTable(
  'draft_batches',
  {
    id: pk(),
    tenant_id: tenantFk(),
    created_by: uuid('created_by'),
    total: integer('total').notNull(),
    succeeded: integer('succeeded').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    status: text('status').notNull().default('running'),
    audience: text('audience').notNull(),
    platforms: text('platforms').array().notNull(),
    writing_template_id: uuid('writing_template_id'),
    query_intent: text('query_intent'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    tenant_created_idx: index('draft_batches_tenant_created_idx').on(t.tenant_id, t.created_at),
  }),
);

export const draftBatchItems = pgTable(
  'draft_batch_items',
  {
    id: pk(),
    batch_id: uuid('batch_id').notNull(),
    tenant_id: tenantFk(),
    question_id: uuid('question_id'),
    topic: text('topic').notNull(),
    platform: text('platform').notNull(),
    status: text('status').notNull().default('pending'),
    content_item_id: uuid('content_item_id'),
    error_msg: text('error_msg'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    batch_idx: index('draft_batch_items_batch_idx').on(t.batch_id),
  }),
);

export type DraftBatch = typeof draftBatches.$inferSelect;
export type NewDraftBatch = typeof draftBatches.$inferInsert;
export type DraftBatchItem = typeof draftBatchItems.$inferSelect;
export type NewDraftBatchItem = typeof draftBatchItems.$inferInsert;
