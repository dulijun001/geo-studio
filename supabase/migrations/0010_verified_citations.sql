-- 0010_verified_citations: tenant-scoped library of trustworthy citations.
--
-- Why: GEO 9 法 把"引用权威来源"列为最强信号,但 LLM 自由发挥经常**编造**
-- 文献(《2024年中国口腔健康白皮书》看似可信实则不存在)。在医疗合规
-- 语境下,编造引用 = 监管投诉 + 平台封号 + 法律纠纷的高危 trigger。
--
-- 这张表是每个租户管理员维护的"可引用文献白名单"。生成 prompt 在系统
-- 提示里把这张表的内容传给 LLM("只能引用这些"),变体生成后扫描
-- 出现的 《...》 / 指南名 / 学会名,跟此表 + 别名比对,匹配不上就标
-- suspected_hallucination,留 audit 追溯。
--
-- 维护方式:
--   - settings/citations 页 UI 增删改
--   - 知识库同步时,knowledge_sources 里 frontmatter 带 verified_citation:true
--     的文档也会自动 upsert 到这张表
--
-- 不允许跨租户读取(RLS),因为每家诊所的可引文献集不同(口腔 / 医美 /
-- 律所 各自有各自的权威来源)。

CREATE TYPE citation_source_type AS ENUM (
  'guideline',         -- 临床指南、诊疗共识(权重最高)
  'research_paper',    -- 同行评议论文
  'textbook',          -- 教科书
  'official_document', -- 政府/卫健委/学会公开文件
  'industry_standard', -- 国标 / 行业标准
  'other'
);

CREATE TABLE verified_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- 主标题:《种植体周围炎临床诊疗指南(2023 版)》。生成时这就是「认可形态」。
  title TEXT NOT NULL,
  -- 别名/缩写,用于 fuzzy match 时降低 false positive。
  -- 例如 主标题《ITI 口腔种植临床指南(第 4 版)》,别名 ['ITI 指南', 'ITI 第 4 版指南']。
  title_aliases TEXT[] NOT NULL DEFAULT '{}',
  source_type citation_source_type NOT NULL,
  issuer TEXT,             -- 例如 "中华口腔医学会"
  publication_year INTEGER, -- 例如 2023
  url TEXT,                 -- 公开 URL(若可)
  notes TEXT,
  -- 是否当前可用(下架不删,以保留历史 variant 引用的有效性)
  active BOOLEAN NOT NULL DEFAULT true,
  -- 谁批准纳入(用于审计)
  verified_by_user_id UUID,
  verified_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX verified_citations_tenant_idx ON verified_citations (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX verified_citations_active_idx ON verified_citations (tenant_id, active) WHERE deleted_at IS NULL;

COMMENT ON TABLE verified_citations IS
  '每租户可引用文献白名单。内容生成 prompt 强约束 + 后置校验,防止 LLM 编造文献。详见 P0-#3 任务说明。';

-- ───────────────────────────────────────────────────────────────────────
-- variant-side: store per-variant citation-validation result.
-- compliance.review 流程会扫描 body 中所有 《...》 / 指南名,跟此租户
-- verified_citations 比对。匹配上 = OK,没匹上 = suspected_hallucination。
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE content_variants
  ADD COLUMN IF NOT EXISTS citation_check JSONB;

-- 期望形态:
--   {
--     "scanned_at": "...",
--     "matches":     [{ "needle": "ITI 口腔种植临床指南", "verified_id": "uuid" }],
--     "unmatched":   [{ "needle": "《2024 年中国口腔健康白皮书》", "context": "..." }],
--     "verdict":     "ok" | "suspected_hallucination"
--   }

COMMENT ON COLUMN content_variants.citation_check IS
  'verified-citations 后置校验结果。verdict=suspected_hallucination 拦截派单。';

-- ───────────────────────────────────────────────────────────────────────
-- 兜底种子 — 真实可引用的医疗文献 / 指南(口腔 / 综合医疗各几条)。
-- 这些是 demo-dental 租户开箱可用的最小集合。生产环境应由管理员从
-- /t/[slug]/settings/citations 页面增删,不要硬编码到迁移里
-- (这里只为了让 demo 环境立刻可演示)。
-- ───────────────────────────────────────────────────────────────────────

INSERT INTO verified_citations (tenant_id, title, title_aliases, source_type, issuer, publication_year, notes)
SELECT
  t.id,
  v.title,
  v.aliases,
  v.source_type::citation_source_type,
  v.issuer,
  v.year,
  v.notes
FROM tenants t
CROSS JOIN (VALUES
  -- 口腔种植
  ('《ITI 口腔种植临床指南(第 4 版)》',
   ARRAY['ITI 口腔种植临床指南','ITI 指南','ITI 第 4 版'],
   'guideline','国际口腔种植学会(ITI)', 2022, 'ITI Treatment Guide 中文版'),
  ('《种植体周围炎临床诊疗指南(2023 版)》',
   ARRAY['种植体周围炎诊疗指南','种植体周围炎指南'],
   'guideline','中华口腔医学会口腔种植专业委员会', 2023, NULL),
  -- 牙周
  ('《中国慢性牙周炎诊疗指南(2017)》',
   ARRAY['慢性牙周炎诊疗指南','牙周炎诊疗指南'],
   'guideline','中华口腔医学会牙周病学专业委员会', 2017, NULL),
  -- 儿童
  ('《儿童龋病防治指南》',
   ARRAY['儿童龋病指南','儿童龋齿防治指南'],
   'guideline','中华口腔医学会儿童口腔医学专业委员会', 2020, NULL),
  ('《儿童牙齿涂氟操作规范》',
   ARRAY['儿童涂氟规范','涂氟操作规范'],
   'industry_standard','国家卫生健康委员会', 2020, NULL),
  -- 正畸
  ('《错颌畸形矫治指南(2020 版)》',
   ARRAY['错颌畸形矫治指南','正畸矫治指南'],
   'guideline','中华口腔医学会正畸专业委员会', 2020, NULL),
  -- 口腔综合
  ('《第四次全国口腔健康流行病学调查报告》',
   ARRAY['第四次口腔健康流调','全国口腔健康流调'],
   'official_document','国家卫生健康委员会', 2018, '权威全国口腔健康基线数据'),
  -- 医疗广告法
  ('《医疗广告管理办法》',
   ARRAY['医疗广告管理办法','医疗广告法'],
   'official_document','国家市场监督管理总局', 2006, '原 2006 版 + 2018 修订')
) AS v(title, aliases, source_type, issuer, year, notes)
WHERE t.deleted_at IS NULL
ON CONFLICT DO NOTHING;
