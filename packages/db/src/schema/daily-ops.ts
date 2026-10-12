import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';

export const dailyOpsRuns = pgTable(
  'daily_ops_runs',
  {
    id: pk(),
    tenant_id: tenantFk(),
    run_date: text('run_date').notNull(),
    status: text('status').notNull().default('picking_topics'),
    picked_question_ids: uuid('picked_question_ids').array().notNull().default([]),
    manual_slots: jsonb('manual_slots').notNull().default([]),
    batch_draft_id: uuid('batch_draft_id'),
    counts: jsonb('counts').notNull().default({}),
    started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    drafted_at: timestamp('drafted_at', { withTimezone: true }),
    notified_at: timestamp('notified_at', { withTimezone: true }),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    dispatched_at: timestamp('dispatched_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    failure_reason: text('failure_reason'),
    ...timestamps(),
  },
  (t) => ({
    tenant_date_uq: uniqueIndex('daily_ops_runs_tenant_date_uq').on(t.tenant_id, t.run_date),
    status_idx: index('daily_ops_runs_status_idx').on(t.tenant_id, t.status),
    tenant_date_desc_idx: index('daily_ops_runs_tenant_date_desc_idx').on(t.tenant_id, t.run_date),
  }),
);

export const dailyOpsSettings = pgTable(
  'daily_ops_settings',
  {
    tenant_id: uuid('tenant_id').primaryKey(),
    enabled: boolean('enabled').notNull().default(false),
    run_cron: text('run_cron').notNull().default('0 18 * * *'),
    topic_count_auto: integer('topic_count_auto').notNull().default(5),
    manual_slot_max: integer('manual_slot_max').notNull().default(2),
    topic_source: text('topic_source').notNull().default('questions_priority'),
    platforms: text('platforms').array().notNull().default([
      'xiaohongshu',
      'douyin_script',
      'wechat_mp',
      'zhihu',
      'toutiao_article',
    ]),
    timeout_hours: integer('timeout_hours').notNull().default(6),
    weekend_skip: boolean('weekend_skip').notNull().default(false),
    max_variants_day: integer('max_variants_day').notNull().default(50),
    notify_channels: text('notify_channels').array().notNull().default(['in_app', 'email']),
    notify_email: text('notify_email'),
    pending_manual_slots: jsonb('pending_manual_slots').notNull().default([]),
    auto_rewrite_yellow: boolean('auto_rewrite_yellow').notNull().default(false),
    auto_dispatch_enabled: boolean('auto_dispatch_enabled').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export type DailyOpsRun = typeof dailyOpsRuns.$inferSelect;
export type NewDailyOpsRun = typeof dailyOpsRuns.$inferInsert;
export type DailyOpsSetting = typeof dailyOpsSettings.$inferSelect;
export type NewDailyOpsSetting = typeof dailyOpsSettings.$inferInsert;
