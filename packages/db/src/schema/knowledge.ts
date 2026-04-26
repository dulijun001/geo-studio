import { relations, sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { contentItems, contentVariants } from './content';
import { pk, tenantFk, timestamps } from './_shared';

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
});

export const privacyLevelEnum = pgEnum('privacy_level', ['L1', 'L2', 'L3', 'L4']);

/**
 * Knowledge source index — one row per md file in the customer knowledge base.
 *
 * GEO Studio does not store the original markdown text; only path + summary +
 * hash + (V2) embedding. RAG retrieval reads the original from the ECS mirror
 * at runtime. See ADR (forthcoming) on knowledge-base-as-source-of-truth.
 *
 * The sync agent worker (apps/worker/src/jobs/knowledge-sync.ts) is the only
 * writer; treat as read-only from the web app.
 */
export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: pk(),
    tenant_id: tenantFk(),
    /** Path relative to KB root, e.g. "诊疗/项目库/种植/单颗种植.md" */
    source_path: text('source_path').notNull(),
    /** Parsed from md H1 */
    title: text('title'),
    /** First paragraph or LLM-generated 200 char abstract */
    excerpt: text('excerpt'),
    /** First path segment: 诊疗 / 患者 / 营销 / 团队 / 合规 / ... */
    category: text('category'),
    /**
     * L1-L4. Defaults to L1; L3/L4 should be excluded by the rsync layer
     * before they ever reach this table, but the sync agent does a second-pass
     * frontmatter check as defense in depth.
     */
    privacy_level: privacyLevelEnum('privacy_level').notNull().default('L1'),
    /** SHA256 of the file bytes — drives incremental reindex */
    source_hash: text('source_hash').notNull(),
    byte_size: integer('byte_size').notNull().default(0),
    /** V2: text-embedding-3-small / doubao-embedding (1536 dims). Nullable in V1. */
    embedding: vector('embedding'),
    indexed_at: timestamp('indexed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    tenant_path_uq: uniqueIndex('knowledge_sources_tenant_path_uq').on(
      t.tenant_id,
      t.source_path,
    ),
    tenant_category_idx: index('knowledge_sources_tenant_category_idx').on(
      t.tenant_id,
      t.category,
    ),
  }),
);

/**
 * Citation back-reference: which knowledge source(s) a content item or variant
 * was generated from. Drives the source_attribution feedback loop (V1.8) —
 * "this knowledge file led to N conversions".
 *
 * Exactly one of (content_item_id, variant_id) should be non-null per row.
 * Variants inherit citations from their parent content item plus any extra
 * sources pulled in during platform-specific variant generation.
 */
export const contentCitations = pgTable(
  'content_citations',
  {
    id: pk(),
    tenant_id: tenantFk(),
    content_item_id: uuid('content_item_id'),
    variant_id: uuid('variant_id'),
    knowledge_source_id: uuid('knowledge_source_id').notNull(),
    /** Actual excerpt cited (kept short, ≤ 500 chars) */
    excerpt_used: text('excerpt_used'),
    /** LLM self-reported retrieval confidence, 0..1 */
    confidence: real('confidence'),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('content_citations_tenant_idx').on(t.tenant_id),
    source_idx: index('content_citations_source_idx').on(t.knowledge_source_id),
    content_item_idx: index('content_citations_content_item_idx')
      .on(t.content_item_id)
      .where(sql`content_item_id IS NOT NULL`),
    variant_idx: index('content_citations_variant_idx')
      .on(t.variant_id)
      .where(sql`variant_id IS NOT NULL`),
  }),
);

export const knowledgeSourcesRelations = relations(knowledgeSources, ({ many }) => ({
  citations: many(contentCitations),
}));

export const contentCitationsRelations = relations(contentCitations, ({ one }) => ({
  source: one(knowledgeSources, {
    fields: [contentCitations.knowledge_source_id],
    references: [knowledgeSources.id],
  }),
  contentItem: one(contentItems, {
    fields: [contentCitations.content_item_id],
    references: [contentItems.id],
  }),
  variant: one(contentVariants, {
    fields: [contentCitations.variant_id],
    references: [contentVariants.id],
  }),
}));

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;
export type ContentCitation = typeof contentCitations.$inferSelect;
export type NewContentCitation = typeof contentCitations.$inferInsert;
