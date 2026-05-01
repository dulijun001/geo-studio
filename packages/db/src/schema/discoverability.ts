/**
 * V1.7 Discoverability Layer schema (services / testimonials / faqs / artifacts).
 *
 * D14-D19 — see CLAUDE.md, ADR 005, docs/06-discoverability.md.
 *
 * Notes:
 *   - All FKs are explicit (not via the broken tenantFk() helper).
 *     Per D19, new tables must declare their own .references() — this file
 *     is the canonical example.
 *   - testimonials.geo_visible is gated by a DB trigger (compliance_status='approved').
 *   - discoverability_artifacts is system-managed; only service_role writes.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_shared';
import { brands } from './brands';
import { tenants } from './tenants';

// ──────────────────────────────────────────────────────────────────────────
// services — service catalog (medical procedures / treatments)
// ──────────────────────────────────────────────────────────────────────────

export const services = pgTable(
  'services',
  {
    id: pk(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description_md: text('description_md'),
    /** { min, max, currency, typical }. Null = price on inquiry. */
    price_range: jsonb('price_range'),
    duration_minutes: integer('duration_minutes'),
    /** SNOMED CT code or internal taxonomy. Maps to schema.org/MedicalProcedure.code. */
    medical_procedure_code: text('medical_procedure_code'),
    /** Visible category label for UI grouping. e.g. "种植牙" / "正畸". */
    category: text('category'),
    geo_visible: boolean('geo_visible').notNull().default(false),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('services_tenant_idx').on(t.tenant_id),
    brand_idx: index('services_brand_idx').on(t.brand_id),
    geo_visible_idx: index('services_geo_visible_idx')
      .on(t.tenant_id, t.brand_id)
      .where(sql`${t.geo_visible} = true AND ${t.deleted_at} IS NULL`),
    category_idx: index('services_category_idx')
      .on(t.tenant_id, t.category)
      .where(sql`${t.deleted_at} IS NULL AND ${t.category} IS NOT NULL`),
  }),
);

// ──────────────────────────────────────────────────────────────────────────
// testimonials — anonymized client testimonials, gated by compliance
// ──────────────────────────────────────────────────────────────────────────

export const testimonials = pgTable(
  'testimonials',
  {
    id: pk(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    /** Optional: which service the testimonial is about */
    service_id: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    /** 'L 女士 / 32 岁 / 南京' style. Never store real name without DPO sign-off. */
    author_pseudonym: text('author_pseudonym').notNull(),
    body: text('body').notNull(),
    rating: numeric('rating', { precision: 2, scale: 1 }),
    attested_at: timestamp('attested_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** D16: must be 'approved' before geo_visible can be true (DB trigger enforces). */
    compliance_status: text('compliance_status').notNull().default('pending'),
    /** Latest compliance_reviews row id for this testimonial. */
    compliance_review_id: uuid('compliance_review_id'),
    geo_visible: boolean('geo_visible').notNull().default(false),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('testimonials_tenant_idx').on(t.tenant_id),
    brand_idx: index('testimonials_brand_idx').on(t.brand_id),
    service_idx: index('testimonials_service_idx').on(t.service_id),
    compliance_idx: index('testimonials_compliance_idx').on(t.tenant_id, t.compliance_status),
    public_idx: index('testimonials_public_idx')
      .on(t.tenant_id, t.brand_id)
      .where(
        sql`${t.geo_visible} = true AND ${t.compliance_status} = 'approved' AND ${t.deleted_at} IS NULL`,
      ),
    rating_check: check(
      'testimonials_rating_range',
      sql`${t.rating} IS NULL OR (${t.rating} >= 1.0 AND ${t.rating} <= 5.0)`,
    ),
    compliance_check: check(
      'testimonials_compliance_status_enum',
      sql`${t.compliance_status} IN ('pending','approved','rejected','needs_review')`,
    ),
  }),
);

// ──────────────────────────────────────────────────────────────────────────
// faqs — curated FAQ list
// ──────────────────────────────────────────────────────────────────────────

export const faqs = pgTable(
  'faqs',
  {
    id: pk(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Nullable: tenant-wide FAQ vs brand-specific. */
    brand_id: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer_md: text('answer_md').notNull(),
    category: text('category'),
    /** Display order within category. Lower = earlier. */
    sort_order: integer('sort_order').notNull().default(0),
    geo_visible: boolean('geo_visible').notNull().default(true),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('faqs_tenant_idx').on(t.tenant_id),
    brand_idx: index('faqs_brand_idx').on(t.brand_id),
    public_idx: index('faqs_public_idx')
      .on(t.tenant_id, t.category, t.sort_order)
      .where(sql`${t.geo_visible} = true AND ${t.deleted_at} IS NULL`),
  }),
);

// ──────────────────────────────────────────────────────────────────────────
// discoverability_artifacts — materialized cache of public outputs
// ──────────────────────────────────────────────────────────────────────────

export const discoverabilityArtifacts = pgTable(
  'discoverability_artifacts',
  {
    id: pk(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    artifact_type: text('artifact_type').notNull(),
    content: text('content').notNull(),
    /** SHA-256 of content. For HTTP If-None-Match → 304. */
    etag: text('etag').notNull(),
    generated_at: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    tenant_type_uq: uniqueIndex('discoverability_artifacts_tenant_type_uq').on(
      t.tenant_id,
      t.artifact_type,
    ),
    artifact_type_check: check(
      'discoverability_artifacts_type_enum',
      sql`${t.artifact_type} IN ('llms_txt','llms_full','feed_json','sitemap_xml')`,
    ),
  }),
);

// ──────────────────────────────────────────────────────────────────────────
// Relations
// ──────────────────────────────────────────────────────────────────────────

export const servicesRelations = relations(services, ({ one, many }) => ({
  tenant: one(tenants, { fields: [services.tenant_id], references: [tenants.id] }),
  brand: one(brands, { fields: [services.brand_id], references: [brands.id] }),
  testimonials: many(testimonials),
}));

export const testimonialsRelations = relations(testimonials, ({ one }) => ({
  tenant: one(tenants, { fields: [testimonials.tenant_id], references: [tenants.id] }),
  brand: one(brands, { fields: [testimonials.brand_id], references: [brands.id] }),
  service: one(services, { fields: [testimonials.service_id], references: [services.id] }),
}));

export const faqsRelations = relations(faqs, ({ one }) => ({
  tenant: one(tenants, { fields: [faqs.tenant_id], references: [tenants.id] }),
  brand: one(brands, { fields: [faqs.brand_id], references: [brands.id] }),
}));

// ──────────────────────────────────────────────────────────────────────────
// Type exports
// ──────────────────────────────────────────────────────────────────────────

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type Testimonial = typeof testimonials.$inferSelect;
export type NewTestimonial = typeof testimonials.$inferInsert;
export type Faq = typeof faqs.$inferSelect;
export type NewFaq = typeof faqs.$inferInsert;
export type DiscoverabilityArtifact = typeof discoverabilityArtifacts.$inferSelect;
export type ArtifactType = 'llms_txt' | 'llms_full' | 'feed_json' | 'sitemap_xml';
export type ComplianceStatus = 'pending' | 'approved' | 'rejected' | 'needs_review';
