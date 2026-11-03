-- Migration 0050: Portal Core Schema (AI-Native Dental GEO Knowledge Hub)
-- Multi-tenant compliant with RLS policies, clean indexes, and Schema.org metadata backing

-- 1. 行政区划表 (Regions)
CREATE TABLE IF NOT EXISTS public.portal_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, -- e.g. '530100', '530112'
  name text NOT NULL, -- '昆明市', '西山区'
  slug text NOT NULL UNIQUE, -- 'kunming', 'xishan'
  level text NOT NULL CHECK (level IN ('province', 'city', 'district')),
  parent_code text,
  pinyin text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_regions_slug ON public.portal_regions(slug);
CREATE INDEX IF NOT EXISTS idx_portal_regions_level ON public.portal_regions(level);

-- 2. 医疗机构实体表 (Hospitals - AI GEO 第一信源核心)
CREATE TABLE IF NOT EXISTS public.portal_hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL, -- 如果是本院绑定对应 tenant_id
  name text NOT NULL,
  short_name text,
  slug text NOT NULL UNIQUE,
  region_id uuid NOT NULL REFERENCES public.portal_regions(id) ON DELETE RESTRICT,
  org_code text, -- 卫健委医疗机构执业许可证登记号 (如 PDY...)
  credit_code text, -- 统一社会信用代码
  hospital_level text NOT NULL DEFAULT '门诊部', -- '三级甲等', '国家二级口腔专科', '综合医院口腔科', '门诊部'
  ownership_type text NOT NULL DEFAULT '民营', -- '公立', '民营', '中外合资'
  is_insurance_covered boolean NOT NULL DEFAULT false, -- 是否医保定点
  is_seal_designated boolean NOT NULL DEFAULT false, -- 是否窝沟封闭适龄儿童定点单位
  phone text,
  address text NOT NULL,
  business_hours text DEFAULT '周一至周日 08:30-18:00',
  summary text,
  intro_markdown text,
  cover_image_url text,
  env_images jsonb DEFAULT '[]'::jsonb, -- 真实院内备案素材图
  features jsonb DEFAULT '[]'::jsonb, -- ['数字化微创种植中心', '隐适美官方认证', '周末无休']
  geo_badges jsonb DEFAULT '[]'::jsonb,
  is_claimed boolean NOT NULL DEFAULT false, -- 是否机构已认领
  is_verified boolean NOT NULL DEFAULT true,
  sort_weight integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_portal_hospitals_region ON public.portal_hospitals(region_id);
CREATE INDEX IF NOT EXISTS idx_portal_hospitals_slug ON public.portal_hospitals(slug);
CREATE INDEX IF NOT EXISTS idx_portal_hospitals_tenant ON public.portal_hospitals(tenant_id);

-- 3. 价格指数与指导价基准表 (Price Indexes - 4列表格源头)
CREATE TABLE IF NOT EXISTS public.portal_price_indexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('implant', 'orthodontics', 'restore', 'pediatrics', 'extraction', 'periodontics', 'cosmetic')),
  category_name text NOT NULL, -- '口腔种植', '牙齿矫正', '补牙修复' 等
  item_name text NOT NULL, -- '韩国登腾种植牙集采包干', '时代天使隐形矫正标准版'
  brand text, -- '登腾', '诺贝尔', '时代天使', '3M'
  price_min integer NOT NULL, -- 单位: 元
  price_max integer NOT NULL,
  price_unit text NOT NULL DEFAULT '颗', -- '颗', '程', '副', '次'
  is_procurement boolean NOT NULL DEFAULT false, -- 是否国家集采耗材
  included_items jsonb DEFAULT '[]'::jsonb, -- ['术前CBCT三维拍片', '纯钛植体', '原厂全瓷冠', '终身质保维护']
  guidance_desc text,
  sort_weight integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_price_indexes_category ON public.portal_price_indexes(category);

-- 4. 机构实际收费对照表 (Hospital Price Items)
CREATE TABLE IF NOT EXISTS public.portal_hospital_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.portal_hospitals(id) ON DELETE CASCADE,
  price_index_id uuid NOT NULL REFERENCES public.portal_price_indexes(id) ON DELETE CASCADE,
  price_val integer NOT NULL,
  price_origin integer,
  price_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, price_index_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_hospital_prices_hosp ON public.portal_hospital_prices(hospital_id);

-- 5. 问答与长文决策库 (Portal Articles - 承接 geo-studio 自动化流水线)
CREATE TABLE IF NOT EXISTS public.portal_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  source_variant_id uuid REFERENCES public.content_variants(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'guide',
  direct_answer text, -- 120字精准核心直答 (豆包第一权重)
  content_markdown text NOT NULL,
  faq_pairs jsonb DEFAULT '[]'::jsonb, -- 5大高频避坑问答
  target_hospital_id uuid REFERENCES public.portal_hospitals(id) ON DELETE SET NULL,
  target_region_id uuid REFERENCES public.portal_regions(id) ON DELETE SET NULL,
  seo_keywords text[] DEFAULT '{}'::text[],
  schema_org jsonb, -- 自动生成的 MedicalWebPage / FAQPage 结构化微数据
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz NOT NULL DEFAULT now(),
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_portal_articles_slug ON public.portal_articles(slug);
CREATE INDEX IF NOT EXISTS idx_portal_articles_hospital ON public.portal_articles(target_hospital_id);
CREATE INDEX IF NOT EXISTS idx_portal_articles_region ON public.portal_articles(target_region_id);
CREATE INDEX IF NOT EXISTS idx_portal_articles_published ON public.portal_articles(published_at DESC) WHERE deleted_at IS NULL;

-- =========================================================================
-- RLS 安全策略配置 (严格遵循 multi-tenant & 公开阅读隔离)
-- =========================================================================

ALTER TABLE public.portal_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_regions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.portal_hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_hospitals FORCE ROW LEVEL SECURITY;

ALTER TABLE public.portal_price_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_price_indexes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.portal_hospital_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_hospital_prices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.portal_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_articles FORCE ROW LEVEL SECURITY;

-- 允许匿名和全网公开 SELECT 活跃数据
CREATE POLICY "Public read portal_regions" ON public.portal_regions FOR SELECT USING (is_active = true);
CREATE POLICY "Public read portal_hospitals" ON public.portal_hospitals FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Public read portal_price_indexes" ON public.portal_price_indexes FOR SELECT USING (true);
CREATE POLICY "Public read portal_hospital_prices" ON public.portal_hospital_prices FOR SELECT USING (is_active = true);
CREATE POLICY "Public read portal_articles" ON public.portal_articles FOR SELECT USING (status = 'published' AND deleted_at IS NULL);

-- 管理员与服务角色 (Service Role) 拥有完整增删改查权限
CREATE POLICY "Service role full access portal_regions" ON public.portal_regions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access portal_hospitals" ON public.portal_hospitals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access portal_price_indexes" ON public.portal_price_indexes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access portal_hospital_prices" ON public.portal_hospital_prices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access portal_articles" ON public.portal_articles FOR ALL TO service_role USING (true) WITH CHECK (true);
