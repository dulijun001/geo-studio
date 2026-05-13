-- 0030_content_contracts: D21 / ADR 009 content contract layer.
--
-- 每篇 GEO 文章在生成前必须先声明一份合同:
--   - article_type (定义 / 误区 / 对比 / 症状 / ...)
--   - query_intent + primary_query (P0 强制约束 prompt 直答前置)
--   - query_cluster ≥ 3 (主问题的衍生问法,服务追踪 query matcher)
--   - 实体 / 受众 / 决策阶段 / 地域 scope / 医疗合规开关
--   - schema_targets (生成前绑定,ADR 005 联动)
--
-- 生成顺序:query_intent → content_contract → writing_template × platform_style
--   前两层强约束,后两层 (D20) 保留作为执行模板。
--
-- 与 content_items 的关系:
--   content_items.content_contract_id NULL = V1.6 legacy path,免 contract
--   NOT NULL = V2 path,生成必须经过合同检查 + DoD 闸门(P1 起)
--
-- 与现有合规四道门(D5/D12)的关系:
--   合规四道门不变;trust_block 完整性是"第五道门",由 Scorer L2 实施。
--   Contract 本身不审合规,只声明"这是一篇什么文章 + 应该怎么写"。
--
-- See docs/07-geo-article-spec.md §三 + ADR 009 决策 1.

-- ── 1. content_contracts ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- 文章类型(7 种),覆盖医疗场景常见结构需求
  article_type text NOT NULL CHECK (article_type IN (
    'definition',
    'myth_busting',
    'comparison',
    'symptom_check',
    'process_expectation',
    'risk_boundary',
    'local_choice'
  )),

  -- 问题意图(8 种),驱动 buildVariantPrompt 的 intentBlock
  query_intent text NOT NULL CHECK (query_intent IN (
    'what_is',
    'is_it_true',
    'which_is_better',
    'why_happens',
    'what_to_do',
    'how_long',
    'when_to_seek_care',
    'how_to_choose_local'
  )),

  -- 主问题(读者会原样输入到豆包搜索)
  primary_query text NOT NULL,
  -- 主问题的 ≥ 3 个衍生问法,服务追踪 query matcher
  query_cluster text[] NOT NULL DEFAULT '{}',

  -- 核心实体
  primary_entity text NOT NULL CHECK (primary_entity IN (
    'brand',
    'service',
    'physician',
    'condition'
  )),
  supporting_entities text[] NOT NULL DEFAULT '{}',

  -- 受众 + 决策阶段 + 地域 scope
  target_audience text NOT NULL,
  decision_stage text NOT NULL CHECK (decision_stage IN (
    'awareness',
    'consideration',
    'decision'
  )),
  location_scope text NOT NULL CHECK (location_scope IN (
    'national',
    'local_city',
    'local_district'
  )),

  -- 医疗合规开关
  reviewer_required boolean NOT NULL DEFAULT true,
  risk_boundary_required boolean NOT NULL DEFAULT true,
  -- FAQ 数量门槛,医疗类默认 5;给生成前的 prompt 注入用
  faq_required_count int NOT NULL DEFAULT 5,
  citation_mode text NOT NULL CHECK (citation_mode IN (
    'verified_only',
    'qualitative_only',
    'mixed'
  )),

  -- ADR 005 联动:schema_targets 必填,生成前已绑定
  schema_targets text[] NOT NULL DEFAULT ARRAY['Article'],

  -- 可选字段装 jsonb 避免高频 schema 变更
  --   {"comparison_objects": [...], "related_services": [...],
  --    "contraindications": [...], "local_trust_signals": [...],
  --    "cta_mode": "soft" | "appointment" | "education_only"}
  optional_fields jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  -- 强约束 cluster 至少 3 个,FAQ 至少 5
  CONSTRAINT content_contracts_query_cluster_min CHECK (cardinality(query_cluster) >= 3),
  CONSTRAINT content_contracts_faq_min CHECK (faq_required_count >= 5)
);

COMMENT ON TABLE public.content_contracts IS
  'D21 / ADR 009: 文章合同。每篇 GEO 内容生成前必须先声明一份,定义意图、主问题、受众、实体、合规开关、Schema 目标。生成顺序的第二层(query_intent → contract → writing_template × platform_style)。';

COMMENT ON COLUMN public.content_contracts.primary_query IS
  '读者会原样输入到豆包搜索的主问题。buildVariantPrompt 用它强制开头 120 字直答。';

COMMENT ON COLUMN public.content_contracts.query_cluster IS
  '主问题的衍生问法 (≥ 3)。GEO 追踪 query matcher 用它做精确 join,不再 embedding 模糊匹配。';

COMMENT ON COLUMN public.content_contracts.schema_targets IS
  'JSON-LD 生成目标 (Article / FAQPage / MedicalProcedure / MedicalBusiness / Physician)。article_type 不同会反向约束这里至少包含哪些。';

-- ── 2. 索引 ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS content_contracts_tenant_idx
  ON public.content_contracts (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS content_contracts_tenant_type_idx
  ON public.content_contracts (tenant_id, article_type)
  WHERE deleted_at IS NULL;

-- 主问题 + 衍生问法的 GIN 索引,为追踪 query matcher join 优化
CREATE INDEX IF NOT EXISTS content_contracts_cluster_gin
  ON public.content_contracts USING gin (query_cluster);

-- ── 3. RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.content_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_contracts FORCE ROW LEVEL SECURITY;

CREATE POLICY "content_contracts_read" ON public.content_contracts
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

CREATE POLICY "content_contracts_insert" ON public.content_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator'])
  );

CREATE POLICY "content_contracts_update" ON public.content_contracts
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator'])
  )
  WITH CHECK (
    public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator'])
  );

-- 软删:UPDATE deleted_at,不真删,保留追溯
CREATE POLICY "content_contracts_soft_delete" ON public.content_contracts
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin'])
  );

-- ── 4. content_items 加引用 ────────────────────────────────────────────

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS content_contract_id uuid
    REFERENCES public.content_contracts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.content_items.content_contract_id IS
  'D21 / ADR 009: 关联的 content_contract。NULL = V1.6 legacy path,免 contract;NOT NULL = V2 path,经过合同检查 + DoD 闸门(P1+)。SET NULL on contract delete,避免 cascade 把内容也连坐。';

CREATE INDEX IF NOT EXISTS content_items_contract_idx
  ON public.content_items (content_contract_id)
  WHERE content_contract_id IS NOT NULL AND deleted_at IS NULL;
