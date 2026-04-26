import { relations, sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
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
    /**
     * Mobile phone (mainland CN format, '13812345678'). Required once invited.
     * Used as login identifier for /staff. Tenant-unique.
     */
    phone: text('phone'),
    /** Persona tags driving tone/specialty/avatar style for dispatching */
    persona: jsonb('persona').notNull().default({}),
    /**
     * Path inside the customer knowledge base pointing to this staff's bio,
     * e.g. "团队/医生/周剑.md". Set by the sync agent when importing doctors
     * from the KB. Null for staff created via admin UI.
     */
    bio_md_path: text('bio_md_path'),
    /** Platform account matrix: { toutiao: {...}, douyin: {...}, ... }. Never store login credentials. */
    platforms: jsonb('platforms').notNull().default({}),
    status: staffStatusEnum('status').notNull().default('active'),
    /** Link to Supabase auth.users. Null until the staff member is invited. */
    auth_user_id: uuid('auth_user_id'),
    /**
     * bcrypt-hashed password for self-service login (V1.6-3). Null until the
     * staff member completes setup via an invite link.
     */
    password_hash: text('password_hash'),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('staff_accounts_tenant_idx').on(t.tenant_id),
    brand_idx: index('staff_accounts_brand_idx').on(t.brand_id),
    auth_idx: index('staff_accounts_auth_idx').on(t.auth_user_id),
    tenant_phone_uq: uniqueIndex('staff_accounts_tenant_phone_uq')
      .on(t.tenant_id, t.phone)
      .where(sql`${t.phone} IS NOT NULL`),
  }),
);

export const staffInviteKindEnum = pgEnum('staff_invite_kind', ['login', 'setup', 'reset']);

/**
 * Multi-purpose staff invite tokens.
 *
 *   - kind='login'  : legacy 6-digit dev passcode, 15-min TTL (W5).
 *   - kind='setup'  : 32-byte one-time link to set initial password (V1.6-3).
 *   - kind='reset'  : 32-byte one-time link to reset password (V1.6-3).
 *
 * For 'setup'/'reset', passcode_hash stores the SHA-256 hash of the link
 * token (the URL ?token=... part). For 'login' it stores the 6-digit hash
 * (W5 W7 unchanged). Format identical, semantics differ by kind.
 */
export const staffInvites = pgTable(
  'staff_invites',
  {
    id: pk(),
    tenant_id: tenantFk(),
    staff_account_id: uuid('staff_account_id').notNull(),
    kind: staffInviteKindEnum('kind').notNull().default('login'),
    /** Hash of the plaintext passcode/token. Plaintext never stored. */
    passcode_hash: text('passcode_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    staff_active_idx: index('staff_invites_staff_active_idx').on(
      t.staff_account_id,
      t.expires_at,
    ),
    tenant_idx: index('staff_invites_tenant_idx').on(t.tenant_id),
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
export type StaffInvite = typeof staffInvites.$inferSelect;
export type NewStaffInvite = typeof staffInvites.$inferInsert;
