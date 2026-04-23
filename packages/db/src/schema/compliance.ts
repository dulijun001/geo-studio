import { relations } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';

export const riskLevelEnum = pgEnum('risk_level', ['low', 'medium', 'high']);
export const reviewStageEnum = pgEnum('review_stage', ['keyword', 'llm', 'manual']);
export const reviewVerdictEnum = pgEnum('review_verdict', ['pass', 'warn', 'reject']);
export const reviewTargetTypeEnum = pgEnum('review_target_type', ['content_variant']);

export const keywordLevelEnum = pgEnum('keyword_level', ['A', 'B']);

/** Global + tenant-level compliance keyword dictionary. Tenant-level rows have a tenant_id; global rows have null. */
export const complianceKeywords = pgTable(
  'compliance_keywords',
  {
    id: pk(),
    tenant_id: uuid('tenant_id'), // null => global
    term: text('term').notNull(),
    level: keywordLevelEnum('level').notNull(),
    category: text('category').notNull(), // guarantee | absolute | comparison | testimonial | ...
    variants: text('variants').array().notNull().default([]),
    context_exempt: text('context_exempt').array().notNull().default([]),
    ...timestamps(),
  },
  (t) => ({
    tenant_term_idx: index('compliance_keywords_tenant_term_idx').on(t.tenant_id, t.term),
    level_idx: index('compliance_keywords_level_idx').on(t.level),
  }),
);

export const complianceReviews = pgTable(
  'compliance_reviews',
  {
    id: pk(),
    tenant_id: tenantFk(),
    target_type: reviewTargetTypeEnum('target_type').notNull(),
    target_id: uuid('target_id').notNull(),
    stage: reviewStageEnum('stage').notNull(),
    verdict: reviewVerdictEnum('verdict').notNull(),
    risk_level: riskLevelEnum('risk_level').notNull(),
    findings: jsonb('findings').notNull().default([]),
    reviewer_id: uuid('reviewer_id'), // null for keyword/llm stages
    llm_response_raw: text('llm_response_raw'),
    rationale: text('rationale'),
    ...timestamps(),
  },
  (t) => ({
    tenant_target_idx: index('compliance_reviews_tenant_target_idx').on(
      t.tenant_id,
      t.target_type,
      t.target_id,
    ),
    stage_idx: index('compliance_reviews_stage_idx').on(t.stage),
  }),
);

export const complianceReviewsRelations = relations(complianceReviews, () => ({}));

export type ComplianceKeyword = typeof complianceKeywords.$inferSelect;
export type NewComplianceKeyword = typeof complianceKeywords.$inferInsert;
export type ComplianceReview = typeof complianceReviews.$inferSelect;
export type NewComplianceReview = typeof complianceReviews.$inferInsert;
