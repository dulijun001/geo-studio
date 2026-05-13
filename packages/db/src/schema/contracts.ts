import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantFk, timestamps } from './_shared';

/**
 * Content contract — D21 / ADR 009.
 *
 * 每篇 GEO 文章在生成前必须先声明一份合同:
 *   - article_type (定义 / 误区 / 对比 / 症状 / ...)
 *   - query_intent + primary_query (强制 prompt 直答前置)
 *   - query_cluster ≥ 3 (服务追踪 query matcher)
 *   - 实体 / 受众 / 决策阶段 / 地域 scope / 医疗合规开关
 *   - schema_targets (生成前绑定,ADR 005 联动)
 *
 * 与 D20 (writing_template × platform_style) 是叠加关系:
 *   query_intent → content_contract → writing_template × platform_style
 *
 * 与 content_items 的关系:
 *   content_items.content_contract_id NULL = V1.6 legacy,免合同
 *   NOT NULL = V2 path,经过合同 + DoD 闸门
 *
 * See docs/07-geo-article-spec.md §三 + migration 0030.
 */
export const contentContracts = pgTable(
  'content_contracts',
  {
    id: pk(),
    tenant_id: tenantFk(),

    /** 文章类型 (7 种)。 */
    article_type: text('article_type').notNull(),
    /** 问题意图 (8 种),驱动 prompt 的 intentBlock。 */
    query_intent: text('query_intent').notNull(),

    /** 读者会原样输入到豆包搜索的主问题。 */
    primary_query: text('primary_query').notNull(),
    /** 主问题的衍生问法 ≥ 3 条。服务追踪 query matcher。 */
    query_cluster: text('query_cluster').array().notNull().default(sql`'{}'::text[]`),

    /** 核心实体类型: brand / service / physician / condition。 */
    primary_entity: text('primary_entity').notNull(),
    supporting_entities: text('supporting_entities').array().notNull().default(sql`'{}'::text[]`),

    /** 目标人群描述,例:准备洁牙的成年人。 */
    target_audience: text('target_audience').notNull(),
    /** awareness / consideration / decision。 */
    decision_stage: text('decision_stage').notNull(),
    /** national / local_city / local_district。 */
    location_scope: text('location_scope').notNull(),

    /** 医疗合规开关。 */
    reviewer_required: boolean('reviewer_required').notNull().default(true),
    risk_boundary_required: boolean('risk_boundary_required').notNull().default(true),
    /** FAQ 数量门槛,医疗类默认 5。 */
    faq_required_count: integer('faq_required_count').notNull().default(5),
    /** verified_only / qualitative_only / mixed。 */
    citation_mode: text('citation_mode').notNull(),

    /** ADR 005 联动: Article / FAQPage / MedicalProcedure / MedicalBusiness / Physician。 */
    schema_targets: text('schema_targets').array().notNull().default(sql`ARRAY['Article']::text[]`),

    /**
     * 可选字段装 jsonb 避免 schema 频繁变更:
     *   { comparison_objects, related_services, contraindications,
     *     local_trust_signals, cta_mode }
     */
    optional_fields: jsonb('optional_fields').notNull().default({}),

    created_by: uuid('created_by'),
    ...timestamps(),
  },
  (t) => ({
    tenant_idx: index('content_contracts_tenant_idx').on(t.tenant_id),
    tenant_type_idx: index('content_contracts_tenant_type_idx').on(t.tenant_id, t.article_type),
    /* CHECK constraints mirror the migration; Drizzle expresses them inline. */
    article_type_ck: check(
      'content_contracts_article_type_ck',
      sql`${t.article_type} IN ('definition','myth_busting','comparison','symptom_check','process_expectation','risk_boundary','local_choice')`,
    ),
    query_intent_ck: check(
      'content_contracts_query_intent_ck',
      sql`${t.query_intent} IN ('what_is','is_it_true','which_is_better','why_happens','what_to_do','how_long','when_to_seek_care','how_to_choose_local')`,
    ),
    primary_entity_ck: check(
      'content_contracts_primary_entity_ck',
      sql`${t.primary_entity} IN ('brand','service','physician','condition')`,
    ),
    decision_stage_ck: check(
      'content_contracts_decision_stage_ck',
      sql`${t.decision_stage} IN ('awareness','consideration','decision')`,
    ),
    location_scope_ck: check(
      'content_contracts_location_scope_ck',
      sql`${t.location_scope} IN ('national','local_city','local_district')`,
    ),
    citation_mode_ck: check(
      'content_contracts_citation_mode_ck',
      sql`${t.citation_mode} IN ('verified_only','qualitative_only','mixed')`,
    ),
    cluster_min_ck: check(
      'content_contracts_query_cluster_min',
      sql`cardinality(${t.query_cluster}) >= 3`,
    ),
    faq_min_ck: check('content_contracts_faq_min', sql`${t.faq_required_count} >= 5`),
  }),
);

export type ContentContract = typeof contentContracts.$inferSelect;
export type NewContentContract = typeof contentContracts.$inferInsert;
