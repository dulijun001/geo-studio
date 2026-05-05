import { relations } from 'drizzle-orm';
import { jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';

export const industryEnum = pgEnum('industry', [
  'dental',
  'medical_beauty',
  'maternity',
  'hair_transplant',
  'law',
  'accounting',
  'education',
  'hospital',
  'fitness',
  'pet',
  'other',
]);

export const planEnum = pgEnum('plan', ['trial', 'pro', 'enterprise']);

export const memberRoleEnum = pgEnum('member_role', [
  'owner',
  'admin',
  'operator',
  'auditor',
  'staff',
]);

export const tenants = pgTable(
  'tenants',
  {
    id: pk(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    industry: industryEnum('industry').notNull().default('other'),
    plan: planEnum('plan').notNull().default('trial'),
    settings: jsonb('settings').notNull().default({}),
    /**
     * Per-tenant filesystem root for the markdown knowledge base. NULL = no
     * KB; sync job skips the tenant. Each tenant must have its own path —
     * never shared, to prevent cross-tenant pollution. (migration 0027)
     */
    knowledge_base_path: text('knowledge_base_path'),
    ...timestamps(),
  },
  (t) => ({
    slug_uq: uniqueIndex('tenants_slug_uq').on(t.slug),
  }),
);

export const tenantMemberships = pgTable('tenant_memberships', {
  id: pk(),
  // Explicit FK (not tenantFk()) — the shared helper lacks .references() and
  // we're not ready to sweep every tenant-scoped table yet. See migration 0014.
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull(), // references auth.users from Supabase
  role: memberRoleEnum('role').notNull(),
  ...timestamps(),
});

export const tenantsRelations = relations(tenants, ({ many }) => ({
  memberships: many(tenantMemberships),
}));

export const tenantMembershipsRelations = relations(tenantMemberships, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantMemberships.tenant_id],
    references: [tenants.id],
  }),
}));

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
