import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';

/**
 * Keyword library — per-tenant taxonomy of GEO target terms used to drive
 * topic discovery + variant prompt keyword planting.
 *
 * Three population modes (see source enum below):
 *   - manual : pasted multi-line input
 *   - combine: 6-axis cartesian product (limit × modifier × core × entity ×
 *              intent × longtail) generated client-side, no LLM call
 *   - ai_dig : doubao expansion of a seed core word (~50 candidates per call)
 *
 * AI-dug candidates MUST pass D5/D12 keyword blacklist (compliance gate 1)
 * BEFORE INSERT — see apps/web/app/api/keywords/dig/route.ts.
 *
 * See ADR 007 + D20.
 */

export const keywordSourceEnum = pgEnum('keyword_source', [
  'manual',
  'combine',
  'ai_dig',
]);

export const keywordIntentEnum = pgEnum('keyword_intent', [
  'limit',
  'modifier',
  'core',
  'entity',
  'intent',
  'longtail',
]);

export const keywordGroups = pgTable(
  'keyword_groups',
  {
    id: pk(),
    tenant_id: tenantFk(),
    name: text('name').notNull(),
    /** Optional nesting; NULL = top-level group. */
    parent_id: uuid('parent_id'),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('keyword_groups_tenant_idx').on(t.tenant_id),
    /** Names unique within the same parent scope per tenant. */
    tenant_parent_name_uq: uniqueIndex('keyword_groups_tenant_parent_name_uq')
      .on(t.tenant_id, t.parent_id, t.name)
      .where(sql`deleted_at IS NULL`),
  }),
);

export const keywords = pgTable(
  'keywords',
  {
    id: pk(),
    tenant_id: tenantFk(),
    /** NULL = ungrouped (default group "默认分组" gets created on tenant bootstrap). */
    group_id: uuid('group_id'),
    text: text('text').notNull(),
    source: keywordSourceEnum('source').notNull(),
    /** Optional. Used by combine + ai_dig for downstream sorting/filtering. */
    intent: keywordIntentEnum('intent'),
    /** Future: { search_volume, competition, last_seen_in_doubao_at, ... } */
    meta: jsonb('meta').notNull().default({}),
    ...timestamps(),
  },
  (t) => ({
    tenant_text_uq: uniqueIndex('keywords_tenant_text_uq')
      .on(t.tenant_id, t.text)
      .where(sql`deleted_at IS NULL`),
    tenant_group_idx: index('keywords_tenant_group_idx').on(
      t.tenant_id,
      t.group_id,
    ),
    tenant_source_idx: index('keywords_tenant_source_idx').on(
      t.tenant_id,
      t.source,
    ),
  }),
);

export type KeywordGroup = typeof keywordGroups.$inferSelect;
export type NewKeywordGroup = typeof keywordGroups.$inferInsert;
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
