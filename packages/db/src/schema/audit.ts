import { inet, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';

/**
 * Cross-cutting audit log. Retain ≥ 3 years for medical compliance / litigation defence.
 * Never delete rows. Never mutate rows after insert.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    tenant_id: tenantFk(),
    actor_user_id: uuid('actor_user_id'),
    action: text('action').notNull(), // dot-separated, e.g. "compliance.manual_approve"
    target_type: text('target_type').notNull(),
    target_id: uuid('target_id'),
    payload: jsonb('payload').notNull().default({}),
    ip: inet('ip'),
    user_agent: text('user_agent'),
    ...timestamps(),
  },
  (t) => ({
    tenant_action_idx: index('audit_logs_tenant_action_idx').on(t.tenant_id, t.action),
    target_idx: index('audit_logs_target_idx').on(t.target_type, t.target_id),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
