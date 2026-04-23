import { relations } from 'drizzle-orm';
import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { publishTasks } from './publish';
import { pk, tenantFk, timestamps } from './_shared';

export const hookTypeEnum = pgEnum('hook_type', [
  'doctor_name',
  'activity_code',
  'phone_tail',
  'utm_qrcode',
]);

export const conversionStageEnum = pgEnum('conversion_stage', [
  'arrived',
  'consulted',
  'treated',
  'paid',
  'lost',
]);

export const hooks = pgTable(
  'hooks',
  {
    id: pk(),
    tenant_id: tenantFk(),
    publish_task_id: uuid('publish_task_id').notNull(),
    hook_type: hookTypeEnum('hook_type').notNull(),
    /** Concrete value: doctor name, secret phrase, phone number, utm param. */
    hook_value: text('hook_value').notNull(),
    valid_until: timestamp('valid_until', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('hooks_tenant_idx').on(t.tenant_id),
    task_idx: index('hooks_task_idx').on(t.publish_task_id),
    type_value_idx: index('hooks_type_value_idx').on(t.hook_type, t.hook_value),
  }),
);

export const conversionEvents = pgTable(
  'conversion_events',
  {
    id: pk(),
    tenant_id: tenantFk(),
    hook_id: uuid('hook_id'),
    stage: conversionStageEnum('stage').notNull(),
    stage_at: timestamp('stage_at', { withTimezone: true }).notNull(),
    /** Amount in cents (bigint; never float). */
    amount_cents: bigint('amount_cents', { mode: 'bigint' }),
    /** Opaque patient reference. No PII. */
    patient_ref: text('patient_ref'),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => ({
    tenant_stage_idx: index('conversion_events_tenant_stage_idx').on(t.tenant_id, t.stage),
    hook_stage_idx: index('conversion_events_hook_stage_idx').on(t.hook_id, t.stage),
  }),
);

export const hooksRelations = relations(hooks, ({ one }) => ({
  task: one(publishTasks, {
    fields: [hooks.publish_task_id],
    references: [publishTasks.id],
  }),
}));

export const conversionEventsRelations = relations(conversionEvents, ({ one }) => ({
  hook: one(hooks, {
    fields: [conversionEvents.hook_id],
    references: [hooks.id],
  }),
}));

export type Hook = typeof hooks.$inferSelect;
export type NewHook = typeof hooks.$inferInsert;
export type ConversionEvent = typeof conversionEvents.$inferSelect;
export type NewConversionEvent = typeof conversionEvents.$inferInsert;
