-- 0039_daily_ops_auto_dispatch — V1.11.3 / D2.
--
-- 2026-05-21 阶段 1:把 V1.10 留下的"advisor 模式"最后一跳补上。
-- auto-dispatch-timeout cron 当前只 mark variants 为 dispatchable + 把 run
-- 标 auto_dispatched_partial,真正生成 publish_tasks 还要客户进 /today 点
-- "批量派单" button。客户每天进系统点一次,违背"无人值守"承诺。
--
-- 闸:per-tenant `auto_dispatch_enabled` boolean。默认 false (保护 27 个
-- 历史 tenant,避免 V1.11.3 deploy 后误派),songshu 显式 SQL set true。
-- 后续新 tenant 在 daily-ops 设置页有 toggle 控件可选。
--
-- worker 看到 enabled=true 时,advanceAwaitingToDispatch() 在 mark run
-- 状态后多走一步:调 runAutoDispatch(tenant_id) → 真写 publish_tasks。

ALTER TABLE public.daily_ops_settings
  ADD COLUMN IF NOT EXISTS auto_dispatch_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.daily_ops_settings.auto_dispatch_enabled IS
  'V1.11.3 D2: cron 自动写 publish_tasks. true = 真零接触 (songshu opt-in); false = advisor 模式 (V1.10 默认行为). 与 enabled 字段独立,可在 daily-ops 启用的前提下让派单仍走人工.';
