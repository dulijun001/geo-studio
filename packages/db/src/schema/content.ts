import { relations, sql } from 'drizzle-orm';
import {
  customType,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
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
  'parsed',
  'variant_generated',
  'archived',
]);

export const variantPlatformEnum = pgEnum('variant_platform', [
  'toutiao_article',
  'douyin_script',
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
