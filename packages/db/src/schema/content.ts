import { relations, sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';

/** pgvector column type (1536 dims for text-embedding-3-small / doubao-embedding). */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
});

export const contentSourceTypeEnum = pgEnum('content_source_type', [
  'word',
  'pdf',
  'manual',
  'url_import',
]);

export const contentItemStatusEnum = pgEnum('content_item_status', [
  'draft',
  'ai_drafted',
  'parsed',
  'variant_generated',
  'archived',
]);

export const variantPlatformEnum = pgEnum('variant_platform', [
  'toutiao_article',
  'douyin_script',
  'douyin_image_text',
  'wechat_mp',
  'zhihu',
  'xiaohongshu',
  'baijiahao',
  'souhu',
]);

export const variantStatusEnum = pgEnum('variant_status', [
  'draft',
  'pending_review',
  'auto_approved',
  'manual_approved',
  'approved',
  'rejected',
  'scheduled',
  'dispatched',
  'archived',
]);

export const complianceStatusEnum = pgEnum('compliance_status', [
  'pending',
  'auto_approved',
  'manual_approved',
  'rejected',
]);

/** GEO tactics from the Aggarwal 2023 paper (9 methods). */
export const geoTacticEnum = pgEnum('geo_tactic', [
  'add_quotation',
  'add_statistics',
  'fluency_optimization',
  'cite_sources',
  'authoritative',
  'technical_terms',
  'easy_to_understand',
  'unique_words',
  'keyword_stuffing', // never used, listed for negative awareness
]);

export const contentItems = pgTable(
  'content_items',
  {
    id: pk(),
    tenant_id: tenantFk(),
    title: text('title').notNull(),
    source_type: contentSourceTypeEnum('source_type').notNull(),
    source_url: text('source_url'),
    markdown: text('markdown').notNull().default(''),
    topics: text('topics').array().notNull().default([]),
    target_questions: uuid('target_questions').array().notNull().default(sql`'{}'::uuid[]`),
    /** ADR 007 — picked in creation wizard step 3, drives prompt skeleton injection. NULL = legacy V1.5/V1.6 path. */
    writing_template_id: uuid('writing_template_id'),
    /** ADR 007 — keywords picked in wizard step 2 to plant in body. */
    keyword_ids: uuid('keyword_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** ADR 009 — picked in creation wizard step 0 (D21). NULL = legacy V1.6 path, NOT NULL = V2 contracted. */
    content_contract_id: uuid('content_contract_id'),
    /** ADR 009 P1 — typed slices extracted from body. Empty = legacy / extractor not run. See migration 0031 + geo-core slice-extractor.ts. */
    slices: jsonb('slices').notNull().default({}),
    /** ADR 009 P2-4 — Definition of Done state. unknown / passed / failed / legacy_passed / manual_pass. dispatchToday excludes 'failed'. */
    dod_status: text('dod_status').notNull().default('unknown'),
    /** Snapshot L2 total at evaluation time, 0-100. */
    dod_score: integer('dod_score'),
    /** { l2_total, l2_breakdown, missing_slices, reasons, threshold, override_* } */
    dod_evidence: jsonb('dod_evidence').notNull().default({}),
    dod_evaluated_at: timestamp('dod_evaluated_at', { withTimezone: true }),
    status: contentItemStatusEnum('status').notNull().default('draft'),
    embedding: vector('embedding'),
    ...timestamps(),
  },
  (t) => ({
    tenant_status_idx: index('content_items_tenant_status_idx').on(t.tenant_id, t.status),
  }),
);

export const contentVariants = pgTable(
  'content_variants',
  {
    id: pk(),
    tenant_id: tenantFk(),
    content_item_id: uuid('content_item_id').notNull(),
    platform: variantPlatformEnum('platform').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    cover_image_url: text('cover_image_url'),
    /** Platform-specific extras: video shot list, BGM ref, hashtags etc. */
    extra_assets: jsonb('extra_assets').notNull().default({}),
    geo_tactics: geoTacticEnum('geo_tactics').array().notNull().default([]),
    compliance_status: complianceStatusEnum('compliance_status').notNull().default('pending'),
    compliance_review_id: uuid('compliance_review_id'),
    status: variantStatusEnum('status').notNull().default('draft'),
    /** ADR 009 P2-4 — DoD gate per platform. dispatchToday excludes 'failed'. */
    dod_status: text('dod_status').notNull().default('unknown'),
    dod_score: integer('dod_score'),
    dod_evidence: jsonb('dod_evidence').notNull().default({}),
    dod_evaluated_at: timestamp('dod_evaluated_at', { withTimezone: true }),
    /** 0009 — GEO 9-tactic score breakdown. */
    geo_score: jsonb('geo_score'),
    /** 0010 — verified-citations validation result. */
    citation_check: jsonb('citation_check'),
    /** 0012 — historical compliance case match result. */
    case_match: jsonb('case_match'),
    /** 0025 — ground-truth numeric claim verification result. */
    numeric_check: jsonb('numeric_check'),
    /** 0035 — compliance auto-rewrite counter. */
    auto_rewrite_count: integer('auto_rewrite_count').notNull().default(0),
    /** 0036 — link back to daily ops run. */
    daily_run_id: uuid('daily_run_id'),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('content_variants_tenant_idx').on(t.tenant_id),
    content_item_idx: index('content_variants_content_item_idx').on(t.content_item_id),
    status_idx: index('content_variants_status_idx').on(t.tenant_id, t.status),
  }),
);

export const contentItemsRelations = relations(contentItems, ({ many }) => ({
  variants: many(contentVariants),
}));

export const contentVariantsRelations = relations(contentVariants, ({ one }) => ({
  contentItem: one(contentItems, {
    fields: [contentVariants.content_item_id],
    references: [contentItems.id],
  }),
}));

export type ContentItem = typeof contentItems.$inferSelect;
export type NewContentItem = typeof contentItems.$inferInsert;
export type ContentVariant = typeof contentVariants.$inferSelect;
export type NewContentVariant = typeof contentVariants.$inferInsert;
