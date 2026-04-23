import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffAccounts } from './brands';
import { contentVariants } from './content';
import { pk, tenantFk, timestamps } from './_shared';

export const publishTaskStatusEnum = pgEnum('publish_task_status', [
  'pending',
  'dispatched',
  'published',
  'skipped',
  'failed',
]);

export const publishTasks = pgTable(
  'publish_tasks',
  {
    id: pk(),
    tenant_id: tenantFk(),
    variant_id: uuid('variant_id').notNull(),
    staff_account_id: uuid('staff_account_id').notNull(),
    scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
    dispatched_at: timestamp('dispatched_at', { withTimezone: true }),
    published_at: timestamp('published_at', { withTimezone: true }),
    published_url: text('published_url'),
    status: publishTaskStatusEnum('status').notNull().default('pending'),
    skip_reason: text('skip_reason'),
    /** Staff's free-form note: rate-limited? platform warning? */
    feedback: text('feedback'),
    ...timestamps(),
  },
  (t) => ({
    tenant_status_idx: index('publish_tasks_tenant_status_idx').on(t.tenant_id, t.status),
    staff_status_idx: index('publish_tasks_staff_status_idx').on(t.staff_account_id, t.status),
    tenant_published_idx: index('publish_tasks_tenant_published_idx').on(
      t.tenant_id,
      t.published_at,
    ),
  }),
);

export const publishTasksRelations = relations(publishTasks, ({ one }) => ({
  variant: one(contentVariants, {
    fields: [publishTasks.variant_id],
    references: [contentVariants.id],
  }),
  staff: one(staffAccounts, {
    fields: [publishTasks.staff_account_id],
    references: [staffAccounts.id],
  }),
}));

export type PublishTask = typeof publishTasks.$inferSelect;
export type NewPublishTask = typeof publishTasks.$inferInsert;
