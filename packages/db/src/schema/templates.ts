import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_shared';

/**
 * Writing templates — intent skeletons (role + structure + voice tilt) that
 * the operator picks during the creation wizard. Combined with
 * PLATFORM_SPEC[platform] in geo-core/generation/prompt-builder to produce the
 * final prompt. Two dimensions stay orthogonal: intent (this table) ×
 * format/length/syntax (PLATFORM_SPEC).
 *
 * tenant_id NULL = system preset (visible to all tenants, immutable).
 * tenant_id NOT NULL = tenant-custom template.
 *
 * See ADR 007 + D20.
 */
export const writingTemplates = pgTable(
  'writing_templates',
  {
    id: pk(),
    /** NULL = system preset, NOT NULL = tenant-owned. */
    tenant_id: uuid('tenant_id'),
    /** Stable id used in code paths. Unique within scope (system or per-tenant). */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /**
     * Markdown / plain text appended to SYSTEM_RULES in buildVariantPrompt.
     * Defines the writer role + intent (e.g. "你是一位资深产品测评编辑..."),
     * NOT format hints — those stay in PLATFORM_SPEC.
     *
     * May contain handlebars-style placeholders rendered by the composer:
     *   {{brand_name}} {{industry}} {{keywords}}.
     */
    prompt_skeleton: text('prompt_skeleton').notNull(),
    /**
     * Optional structure hint injected into user message.
     * Shape: { sections: ["H2 痛点", "H2 方案"], min_sections?: 3, ... }
     */
    structure_hint: jsonb('structure_hint').notNull().default({}),
    /** True for the 12 system presets seeded with migration 0024. */
    is_system: boolean('is_system').notNull().default(false),
    /** Per-tenant batch hide/show toggle. System presets respect tenant.visible. */
    visible: boolean('visible').notNull().default(true),
    created_by: uuid('created_by'),
    ...timestamps(),
  },
  (t) => ({
    /** Slug uniqueness scoped to tenant (NULL tenant scope = system row). */
    tenant_slug_uq: uniqueIndex('writing_templates_tenant_slug_uq').on(
      t.tenant_id,
      t.slug,
    ),
    /** Look up visible templates for a tenant + system. */
    tenant_visible_idx: index('writing_templates_tenant_visible_idx').on(
      t.tenant_id,
      t.visible,
    ),
    system_idx: index('writing_templates_system_idx')
      .on(t.slug)
      .where(sql`tenant_id IS NULL`),
  }),
);

export type WritingTemplate = typeof writingTemplates.$inferSelect;
export type NewWritingTemplate = typeof writingTemplates.$inferInsert;
