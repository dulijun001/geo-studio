import { relations } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';
import { tenants } from './tenants';

export const staffRoleEnum = pgEnum('staff_role', [
  'doctor',
  'consultant',
  'receptionist',
  'marketing',
  'nurse',
  'other',
]);

export const staffStatusEnum = pgEnum('staff_status', ['active', 'paused', 'offboarding']);

export const vocabTypeEnum = pgEnum('vocab_type', [
  'brand',
  'doctor',
  'service',
  'location_alias',
  'competitor',
]);

export const brands = pgTable(
  'brands',
  {
    id: pk(),
    tenant_id: tenantFk(),
    name: text('name').notNull(),
    /** { city, district, address, lat, lng } */
    location: jsonb('location').notNull().default({}),
    /** Phone pool for phone-tail hooks. */
    contact_phones: text('contact_phones').array().notNull().default([]),
    /** WeCom QR url embedded in published content for utm-based attribution. */
    wecom_qr_url: text('wecom_qr_url'),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('brands_tenant_idx').on(t.tenant_id),
  }),
);

export const staffAccounts = pgTable(
  'staff_accounts',
  {
    id: pk(),
    tenant_id: tenantFk(),
    brand_id: uuid('brand_id').notNull(),
    real_name: text('real_name').notNull(),
    role: staffRoleEnum('role').notNull(),
    /** Persona tags driving tone/specialty/avatar style for dispatching */
    persona: jsonb('persona').notNull().default({}),
    /** Platform account matrix: { toutiao: {...}, douyin: {...}, ... }. Never store login credentials. */
    platforms: jsonb('platforms').notNull().default({}),
    status: staffStatusEnum('status').notNull().default('active'),
    /** Link to Supabase auth.users. Null until the staff member is invited. */
    auth_user_id: uuid('auth_user_id'),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('staff_accounts_tenant_idx').on(t.tenant_id),
    brand_idx: index('staff_accounts_brand_idx').on(t.brand_id),
    auth_idx: index('staff_accounts_auth_idx').on(t.auth_user_id),
  }),
);

export const brandVocab = pgTable(
  'brand_vocab',
  {
    id: pk(),
    tenant_id: tenantFk(),
    term: text('term').notNull(),
    term_type: vocabTypeEnum('term_type').notNull(),
    aliases: text('aliases').array().notNull().default([]),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('brand_vocab_tenant_idx').on(t.tenant_id),
  }),
);

export const brandsRelations = relations(brands, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [brands.tenant_id],
    references: [tenants.id],
  }),
  staff: many(staffAccounts),
}));

export const staffAccountsRelations = relations(staffAccounts, ({ one }) => ({
  brand: one(brands, {
    fields: [staffAccounts.brand_id],
    references: [brands.id],
  }),
}));

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
export type StaffAccount = typeof staffAccounts.$inferSelect;
export type NewStaffAccount = typeof staffAccounts.$inferInsert;
export type BrandVocab = typeof brandVocab.$inferSelect;
