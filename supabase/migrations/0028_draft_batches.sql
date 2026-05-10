-- 0028_draft_batches: 批量 AI 起草(每天 N 题 × M 平台并发跑)
--
-- Decision: V1.9 batch-drafting workflow (CLAUDE.md 第九节"当前阶段"延续 V1.8)。
--
-- 现状链路:createAiDraft (server action) → 1 篇 1 平台主稿 → 用户手动点
--   "生成变体" → content.variant_generate (worker) → N 个 content_variants。
-- 30 员工 × 3 平台 = 30 任务/天,要求一次提交 10 题 × 3 平台 = 30 LLM 任务,
-- 后台并发 5 路跑,每个 item 完成立刻级联 variant_generate,自动派单。
--
-- 表设计:
--   draft_batches      : 一次批量提交的元数据(总计/成功/失败 + 共享配置)
--   draft_batch_items  : 每个 (题, 平台) 单元的执行状态 + 回填 content_item_id
--
-- 与 V1.8 ADR 007 关系:批量页本质是「创作向导」的 N×M 模式,
-- writing_template_id / audience 在 batch 级共享(全部 item 同一模板/受众)。
--
-- ----------------------------------------------------------------------
-- 1. draft_batches
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.draft_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid,  -- auth.users.id;不强 FK 防 user 删除级联
  -- 总数 = items 数;成功/失败实时由 worker 写
  total int NOT NULL CHECK (total > 0),
  succeeded int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  -- running: 还有 pending/running item;completed: 全 succeeded;
  -- partial: 至少 1 个失败但有成功;failed: 全失败
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','partial','failed')),
  -- 批量级共享配置(每个 item 用同一个)
  audience text NOT NULL,
  platforms text[] NOT NULL CHECK (cardinality(platforms) > 0),
  writing_template_id uuid REFERENCES public.writing_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS draft_batches_tenant_created_idx
  ON public.draft_batches (tenant_id, created_at DESC);

ALTER TABLE public.draft_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draft_batches_read" ON public.draft_batches FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

-- INSERT/UPDATE 走 service-role(server action + worker),不走 authenticated。
-- 故不写 INSERT/UPDATE policy(authenticated 默认无权)。

COMMENT ON TABLE public.draft_batches IS
  '批量 AI 起草元数据。一行 = 一次「今日批量生成」点击。';
COMMENT ON COLUMN public.draft_batches.platforms IS
  '本批共享的目标平台数组,如 ARRAY[''toutiao_article'',''wechat_mp'',''zhihu'']';

-- ----------------------------------------------------------------------
-- 2. draft_batch_items
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.draft_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.draft_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- 来源选题:从 questions 表挑(可空,允许批量里夹带自定义 topic)
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  -- 实际写入 LLM 的主题文本(snapshot,questions 表后改不影响历史)
  topic text NOT NULL,
  -- 单 item 也按平台分:1 行 = 1 (主题 × 平台) 任务
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','succeeded','failed')),
  -- 成功后回填(参与 V1.8 attribution 链路)
  content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  error_msg text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS draft_batch_items_batch_idx
  ON public.draft_batch_items (batch_id);

CREATE INDEX IF NOT EXISTS draft_batch_items_status_idx
  ON public.draft_batch_items (batch_id, status);

ALTER TABLE public.draft_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draft_batch_items_read" ON public.draft_batch_items FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

COMMENT ON TABLE public.draft_batch_items IS
  '批量起草的单 (题, 平台) 单元。worker 跑完写 succeeded/failed + content_item_id 回填。';
