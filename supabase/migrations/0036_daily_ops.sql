-- 0036_daily_ops: V1.10 Daily Ops Auto-Pipeline (docs/09).
--
-- 客户反馈 2026-05-19 "每天都要盯发送给员工太麻烦" → 立项把内容生产线 cron 起来,
-- 客户只在异常时介入。详见 docs/09-daily-ops-automation.md.
--
-- 本 migration 加:
--   1. daily_ops_runs      — 每日 run 生命周期(picking → drafting → review → dispatch)
--   2. daily_ops_settings  — 租户级配置(频率/超时/通知渠道/选题源)
--   3. content_variants.daily_run_id — 反查 variant 来自哪个 daily run
--
-- RLS 风格:沿用 0028 风格,SELECT to authenticated,INSERT/UPDATE 走 service-role
-- (cron worker + server actions),authenticated 默认拒绝写.

-- ──────────────────────────────────────────────────────────────────────
-- 1. daily_ops_runs
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_ops_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_date        date NOT NULL,

  -- 生命周期状态机:
  --   picking_topics            选题中(cron #1 启动)
  --   drafting                  batch draft 跑中
  --   evaluating                DoD + 合规审核中
  --   awaiting_review           已通知客户,6h 倒计时
  --   auto_dispatched_partial   超时:绿色已派,黄/红/黑 stay
  --   awaiting_manual           客户审中(未超时)
  --   completed                 全部派完(全绿色 + 客户手动审完)
  --   failed                    LLM 全失败 / cron 异常
  status          text NOT NULL DEFAULT 'picking_topics'
    CHECK (status IN (
      'picking_topics','drafting','evaluating',
      'awaiting_review','auto_dispatched_partial','awaiting_manual',
      'completed','failed'
    )),

  -- 选题快照(picking_topics 阶段写入)
  picked_question_ids uuid[] NOT NULL DEFAULT '{}',
  manual_slots        jsonb  NOT NULL DEFAULT '[]'::jsonb,
    -- [{topic: string, audience: string, platforms: string[]}, ...]

  -- 关联到 V1.9 batch_drafts(drafting 阶段写入)
  batch_draft_id  uuid REFERENCES public.draft_batches(id),

  -- 计数快照(evaluating 阶段更新)
  counts          jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- { planned, drafted, green, yellow, red, black,
    --   dispatched, manual_pending, failed }

  -- 时间线(每阶段完成时打戳)
  started_at      timestamptz NOT NULL DEFAULT now(),
  drafted_at      timestamptz,
  notified_at     timestamptz,
  reviewed_at     timestamptz,
  dispatched_at   timestamptz,
  completed_at    timestamptz,

  -- 异常
  failure_reason  text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- 每租户每天最多 1 个 run(防 cron 重复触发产生 2 个)
CREATE UNIQUE INDEX IF NOT EXISTS daily_ops_runs_tenant_date_uq
  ON public.daily_ops_runs (tenant_id, run_date) WHERE deleted_at IS NULL;

-- 状态查询索引(/today 页 + cron 扫描用)
CREATE INDEX IF NOT EXISTS daily_ops_runs_status_idx
  ON public.daily_ops_runs (tenant_id, status) WHERE deleted_at IS NULL;

-- run_date desc 索引(历史回看 /today/history 用)
CREATE INDEX IF NOT EXISTS daily_ops_runs_tenant_date_desc_idx
  ON public.daily_ops_runs (tenant_id, run_date DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.daily_ops_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_ops_runs_read" ON public.daily_ops_runs FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

-- INSERT/UPDATE 走 service-role (cron worker + admin server actions),
-- 不写 INSERT/UPDATE policy → authenticated 默认无写权.

ALTER TABLE public.daily_ops_runs FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.daily_ops_runs IS
  'V1.10 Daily Ops Auto-Pipeline 每日 run 生命周期。docs/09. 一行 = 一天一个 tenant 的 run.';
COMMENT ON COLUMN public.daily_ops_runs.status IS
  '生命周期状态机. cron #1 创建 (picking_topics → drafting → evaluating → awaiting_review). cron #2 推进 (→ auto_dispatched_partial / awaiting_manual / completed).';
COMMENT ON COLUMN public.daily_ops_runs.manual_slots IS
  '客户手填位 snapshot,前一日 23:59 锁定后写入. [{topic, audience, platforms}, ...]';
COMMENT ON COLUMN public.daily_ops_runs.counts IS
  '运营快照: { planned, drafted, green, yellow, red, black, dispatched, manual_pending, failed }. evaluating + dispatch 阶段更新.';

-- ──────────────────────────────────────────────────────────────────────
-- 2. daily_ops_settings
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_ops_settings (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- 总开关. 默认 false → 客户必须显式开启,避免新租户被意外卷入 cron.
  enabled          boolean NOT NULL DEFAULT false,

  -- cron 表达式. 默认每天凌晨 02:00 (pg-boss tz=UTC, 实际 = 北京时间 10:00).
  -- 后期 admin UI 提供北京时间下拉,转换写入 UTC.
  -- 注:这里存 UTC,Asia/Shanghai 北京 = UTC+8,所以北京 02:00 = UTC 18:00 前一日.
  -- 为避免日期边界混淆,默认 cron='0 18 * * *' 表示 UTC 18:00 = 北京次日 02:00.
  run_cron         text    NOT NULL DEFAULT '0 18 * * *',

  -- 选题策略
  topic_count_auto integer NOT NULL DEFAULT 5
    CHECK (topic_count_auto BETWEEN 0 AND 15),
  manual_slot_max  integer NOT NULL DEFAULT 2
    CHECK (manual_slot_max BETWEEN 0 AND 5),

  -- 选题源 (D-Ops-9: 预留 docs/08 反馈回路接入口)
  topic_source     text NOT NULL DEFAULT 'questions_priority'
    CHECK (topic_source IN ('questions_priority','feedback_loop','hybrid')),

  -- 平台覆盖(留空 = 默认 5 平台,enum 跟 content_variants.platform 一致)
  platforms        text[] NOT NULL DEFAULT
    ARRAY['xiaohongshu','douyin_script','wechat_mp','zhihu','toutiao_article'],

  -- 审核超时窗口
  timeout_hours    integer NOT NULL DEFAULT 6
    CHECK (timeout_hours IN (2,4,6,8,12,24)),

  -- 周末跳过
  weekend_skip     boolean NOT NULL DEFAULT false,

  -- 节流:每日变体总数上限(防员工矩阵被淹没)
  max_variants_day integer NOT NULL DEFAULT 50
    CHECK (max_variants_day BETWEEN 5 AND 200),

  -- 通知渠道(V1 = in_app + email, V2 加 wecom + sms)
  notify_channels  text[] NOT NULL DEFAULT ARRAY['in_app','email']
    CHECK (notify_channels <@ ARRAY['in_app','email','wecom','sms']),
  notify_email     text,
  -- 注:notify_email 留空 = 用 tenants.owner_email (回填逻辑在 server action 做,不在 DB).

  -- 客户白天填的"下次会用的"手填位. cron 凌晨读它写进 run.manual_slots,
  -- 不清空 → 客户可"固定模板"每日复用,也可主动改.
  -- 格式: [{topic: string, audience: string, platforms: string[]}, ...]
  -- D-Ops-6 简化版:不做"23:59 锁定",凌晨 cron 触发时直接读当前值.
  -- 客户白天什么时候填都行,改完即为"下一次凌晨 cron 用的".
  pending_manual_slots jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_ops_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_ops_settings_read" ON public.daily_ops_settings FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

-- UPDATE 走 server action (admin only),不写 authenticated policy.

ALTER TABLE public.daily_ops_settings FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.daily_ops_settings IS
  'V1.10 Daily Ops 租户级配置. docs/09 §2.2 + D-Ops-2~D-Ops-10. 一租户一行 (tenant_id PK).';
COMMENT ON COLUMN public.daily_ops_settings.run_cron IS
  'cron 表达式 UTC 时区. 默认 0 18 * * * = UTC 18:00 = 北京时间次日 02:00. UI 提供北京时区下拉转写.';
COMMENT ON COLUMN public.daily_ops_settings.topic_source IS
  'D-Ops-9: 选题源可插拔. questions_priority=现有 questions 表抽; feedback_loop=docs/08 §8 断点 1 后切换; hybrid=两者混合.';
COMMENT ON COLUMN public.daily_ops_settings.max_variants_day IS
  '每日变体总数节流. 超出 spill 到次日 (worker 端逻辑). 防员工矩阵 40 人被淹没.';

-- ──────────────────────────────────────────────────────────────────────
-- 3. content_variants.daily_run_id 反查列
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.content_variants
  ADD COLUMN IF NOT EXISTS daily_run_id uuid REFERENCES public.daily_ops_runs(id);

CREATE INDEX IF NOT EXISTS content_variants_daily_run_idx
  ON public.content_variants (daily_run_id) WHERE deleted_at IS NULL AND daily_run_id IS NOT NULL;

COMMENT ON COLUMN public.content_variants.daily_run_id IS
  'V1.10 docs/09: 该 variant 来自哪个 daily run. NULL = 非 daily-ops 流程产出 (V1.9 batch / 手动). 用于 /today 页反查 + 异常审计.';

-- ──────────────────────────────────────────────────────────────────────
-- 4. RPC: daily_ops_pick_topics — 混合选题算法核心
-- ──────────────────────────────────────────────────────────────────────
-- 抽成 SECURITY INVOKER 函数,RLS 自动应用(调用方必须能读 questions + content_items).
-- 嵌套子查询计算每个 question 的 last_used_at (反查 content_items.target_questions[]),
-- 然后 priority desc + last_used_at asc 排序,排除最近 N 天用过的.
-- 不在 JS 端写,因为 supabase-js 不支持嵌套子查询 + 跨表 ORDER BY.

CREATE OR REPLACE FUNCTION public.daily_ops_pick_topics(
  p_tenant_id uuid,
  p_limit int DEFAULT 5,
  p_exclude_days int DEFAULT 7
)
RETURNS TABLE (
  id uuid,
  text text,
  intent text,
  priority int,
  last_used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH q_with_last AS (
    SELECT
      q.id,
      q.text,
      q.intent::text,
      q.priority,
      (
        SELECT MAX(ci.created_at)
          FROM public.content_items ci
         WHERE q.id = ANY(ci.target_questions)
           AND ci.tenant_id = q.tenant_id
           AND ci.deleted_at IS NULL
      ) AS last_used_at
    FROM public.questions q
    WHERE q.tenant_id = p_tenant_id
      AND q.deleted_at IS NULL
  )
  SELECT id, text, intent, priority, last_used_at
    FROM q_with_last
   WHERE last_used_at IS NULL
      OR last_used_at < now() - (p_exclude_days || ' days')::interval
   ORDER BY priority DESC,
            last_used_at ASC NULLS FIRST,
            id ASC  -- tiebreaker for determinism
   LIMIT GREATEST(p_limit, 0);
$$;

COMMENT ON FUNCTION public.daily_ops_pick_topics IS
  'V1.10 docs/09 §2.1 topic picker. SECURITY INVOKER → RLS-aware. 排除最近 N 天用过的 question (查 content_items.target_questions[]),按 priority desc + last_used_at asc 排.';

-- ──────────────────────────────────────────────────────────────────────
-- 5. 默认配置回填(给现有 tenants 创建一条 disabled 的 settings)
-- ──────────────────────────────────────────────────────────────────────
-- 不在此 migration 自动 enable; 客户必须显式开启. (D-Ops-2 + 安全默认)

INSERT INTO public.daily_ops_settings (tenant_id, enabled)
SELECT id, false
  FROM public.tenants
 WHERE deleted_at IS NULL
ON CONFLICT (tenant_id) DO NOTHING;
