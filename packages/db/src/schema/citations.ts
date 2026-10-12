import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';

export const citationSourceTypeEnum = pgEnum('citation_source_type', [
  'guideline',
  'research_paper',
  'textbook',
  'official_document',
  'industry_standard',
  'other',
]);

export const verifiedCitations = pgTable(
  'verified_citations',
  {
    id: pk(),
    tenant_id: tenantFk(),
    title: text('title').notNull(),
    title_aliases: text('title_aliases').array().notNull().default([]),
    source_type: citationSourceTypeEnum('source_type').notNull(),
    issuer: text('issuer'),
    publication_year: integer('publication_year'),
    url: text('url'),
    notes: text('notes'),
    key_claims: text('key_claims').array().notNull().default([]),
    active: boolean('active').notNull().default(true),
    verified_by_user_id: uuid('verified_by_user_id'),
    verified_at: timestamp('verified_at', { withTimezone: true }).defaultNow(),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('verified_citations_tenant_idx').on(t.tenant_id),
    active_idx: index('verified_citations_active_idx').on(t.tenant_id, t.active),
  }),
);

export type VerifiedCitation = typeof verifiedCitations.$inferSelect;
export type NewVerifiedCitation = typeof verifiedCitations.$inferInsert;
