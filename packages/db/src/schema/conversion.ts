import { relations } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
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

export const customerIdentities = pgTable(
  'customer_identities',
  {
    id: pk(),
    tenant_id: tenantFk(),
    patient_ref: text('patient_ref'),
    client_fingerprint: text('client_fingerprint'),
    first_hook_value: text('first_hook_value'),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('customer_identities_tenant_idx').on(t.tenant_id),
    patient_ref_idx: index('customer_identities_patient_ref_idx').on(t.tenant_id, t.patient_ref),
    fingerprint_idx: index('customer_identities_fingerprint_idx').on(t.tenant_id, t.client_fingerprint),
  }),
);

export const journeyTouchpoints = pgTable(
  'journey_touchpoints',
  {
    id: pk(),
    tenant_id: tenantFk(),
    identity_id: uuid('identity_id').notNull(),
    publish_task_id: uuid('publish_task_id'),
    touchpoint_type: text('touchpoint_type').notNull().default('view'),
    touched_at: timestamp('touched_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull().default({}),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    identity_idx: index('journey_touchpoints_identity_idx').on(t.identity_id, t.touched_at),
    tenant_time_idx: index('journey_touchpoints_tenant_time_idx').on(t.tenant_id, t.touched_at),
  }),
);

export const conversionEvents = pgTable(
  'conversion_events',
  {
    id: pk(),
    tenant_id: tenantFk(),
    hook_id: uuid('hook_id'),
    identity_id: uuid('identity_id'),
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
