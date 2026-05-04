-- 0024_writing_templates_and_keywords: GEO 创作向导骨架表 + 关键词词库
--
-- Decision: D20 (CLAUDE.md), ADR 007.
--
-- 由竞品「抓词GEO」分析归纳而来:
--   - writing_templates : 写作要求(意图骨架)— 角色 / 结构 / 声调倾向
--   - keyword_groups + keywords : 关键词词库,三种拓词来源(manual/combine/ai_dig)
--   - content_items += writing_template_id, keyword_ids
--
-- 与 V1.5/V1.6 的关系:
--   buildVariantPrompt(geo-core/generation/prompt-builder.ts) 加可选入参
--   writing_template,缺省时行为不变;有时叠加进 system+user message。
--
-- ----------------------------------------------------------------------
-- 1. writing_templates
-- ----------------------------------------------------------------------
-- 系统预设(tenant_id IS NULL)对所有租户可读,租户不可改写,只能 batch hide.
-- 租户自定义(tenant_id NOT NULL)走标准 RLS。
--
-- D14/D19: 显式 FK + ON DELETE CASCADE,不依赖 tenantFk() helper。

CREATE TABLE IF NOT EXISTS public.writing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = 系统预设(seed 写入,12 条);NOT NULL = 租户自定义
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- 代码引用稳定 id,如 'tutorial' / 'pas' / 'product-comparison'
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  -- 注入到 buildVariantPrompt 的 SYSTEM_RULES 之后,定义"角色 + 意图"
  prompt_skeleton text NOT NULL,
  -- 注入到 user message 的"目标平台格式"之后,如:
  --   {"sections":["H2 痛点","H2 方案"], "min_sections":3}
  structure_hint jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 12 系统预设全部 true,租户自定义全部 false
  is_system boolean NOT NULL DEFAULT false,
  -- 租户级批量隐藏开关(系统预设也可被某租户隐藏不显示)
  visible boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- slug 唯一性按"租户 scope"分:NULL scope(系统)内全局唯一,
-- 每个租户 scope 内唯一。Postgres 在 unique 约束里 NULL 不参与比较,
-- 所以用部分唯一索引区分两种 scope。
CREATE UNIQUE INDEX IF NOT EXISTS writing_templates_system_slug_uq
  ON public.writing_templates (slug)
  WHERE tenant_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS writing_templates_tenant_slug_uq
  ON public.writing_templates (tenant_id, slug)
  WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS writing_templates_tenant_visible_idx
  ON public.writing_templates (tenant_id, visible)
  WHERE deleted_at IS NULL;

ALTER TABLE public.writing_templates ENABLE ROW LEVEL SECURITY;

-- READ: 系统预设 + 自己租户的自定义都可读
CREATE POLICY "writing_templates_read" ON public.writing_templates FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT public.current_user_tenant_ids())
  );

-- INSERT: 仅本租户 admin/operator 可建,且不能伪造 is_system=true
CREATE POLICY "writing_templates_insert" ON public.writing_templates FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator'])
    AND is_system = false
  );

-- UPDATE: 系统预设永远不可改;租户自定义需 admin/operator
CREATE POLICY "writing_templates_update" ON public.writing_templates FOR UPDATE TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND is_system = false
    AND public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator'])
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND is_system = false
    AND public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator'])
  );

-- DELETE(软删):同 UPDATE
CREATE POLICY "writing_templates_delete" ON public.writing_templates FOR DELETE TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND is_system = false
    AND public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator'])
  );

COMMENT ON TABLE public.writing_templates IS
  '写作要求(意图骨架)— ADR 007。tenant_id IS NULL = 12 系统预设,租户共享只读;tenant_id NOT NULL = 租户自定义。';
COMMENT ON COLUMN public.writing_templates.prompt_skeleton IS
  '注入到 buildVariantPrompt 的 SYSTEM_RULES 之后。可含 {{brand_name}} {{industry}} {{keywords}} 占位符。';
COMMENT ON COLUMN public.writing_templates.structure_hint IS
  '注入到 user message。Shape: {sections:[...], min_sections?:n}。';

-- ----------------------------------------------------------------------
-- 2. keyword_groups
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.keyword_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- 支持嵌套(例:"种植 > 种植牙价格")。NULL = 顶层
  parent_id uuid REFERENCES public.keyword_groups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS keyword_groups_tenant_idx
  ON public.keyword_groups (tenant_id) WHERE deleted_at IS NULL;

-- 同一父级下 name 唯一
CREATE UNIQUE INDEX IF NOT EXISTS keyword_groups_tenant_parent_name_uq
  ON public.keyword_groups (tenant_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
  WHERE deleted_at IS NULL;

ALTER TABLE public.keyword_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keyword_groups_read" ON public.keyword_groups FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

CREATE POLICY "keyword_groups_write" ON public.keyword_groups FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));

COMMENT ON TABLE public.keyword_groups IS
  '关键词分组,支持嵌套。租户隔离。ADR 007。';

-- ----------------------------------------------------------------------
-- 3. keywords
-- ----------------------------------------------------------------------
-- D5/D12 提示:AI 智能挖掘(source='ai_dig')候选词必须在写入前过合规第 1 道门,
-- 见 apps/web/app/api/keywords/dig/route.ts。

CREATE TYPE keyword_source AS ENUM ('manual', 'combine', 'ai_dig');
CREATE TYPE keyword_intent AS ENUM ('limit', 'modifier', 'core', 'entity', 'intent', 'longtail');

CREATE TABLE IF NOT EXISTS public.keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.keyword_groups(id) ON DELETE SET NULL,
  text text NOT NULL,
  source keyword_source NOT NULL,
  intent keyword_intent,
  -- 后期 enrich:{search_volume, competition, last_seen_in_doubao_at, ...}
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS keywords_tenant_text_uq
  ON public.keywords (tenant_id, text) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS keywords_tenant_group_idx
  ON public.keywords (tenant_id, group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS keywords_tenant_source_idx
  ON public.keywords (tenant_id, source) WHERE deleted_at IS NULL;

ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keywords_read" ON public.keywords FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

CREATE POLICY "keywords_write" ON public.keywords FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));

COMMENT ON TABLE public.keywords IS
  '关键词词库。source=ai_dig 必须在写入前过合规第 1 道门(D5/D12)。ADR 007。';

-- ----------------------------------------------------------------------
-- 4. content_items 扩列
-- ----------------------------------------------------------------------

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS writing_template_id uuid REFERENCES public.writing_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS keyword_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.content_items.writing_template_id IS
  'ADR 007 — 创作向导第 3 步选定的写作要求。NULL = V1.5/V1.6 旧路径(buildVariantPrompt 不注入 template)。';
COMMENT ON COLUMN public.content_items.keyword_ids IS
  'ADR 007 — 创作向导第 2 步选定的植入关键词。空数组 = 旧路径。';
