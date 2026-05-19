-- 0037_daily_ops_auto_rewrite_yellow — V1.11 T4 (docs/04 V1.11 模块清单).
--
-- 2026-05-19 用户拍板 C 方案:cron 自动改写 yellow.
-- V1.10 真生产跑后 22/25 variants 落入 yellow(GEO score 低 / pending compliance).
-- 客户痛点:需要点 22 次「⚡ AI 一键改写」.
-- 解:cron #2 advanceDraftingToAwaiting 在 stillEvaluating=false 后,扫 yellow
-- + auto_rewrite_count=0 → enqueue compliance.auto_rewrite (复用 D5/D12 §13.3
-- max 1× 限制,worker handler 已存在,bump auto_rewrite_count 防再触发).

ALTER TABLE public.daily_ops_settings
  ADD COLUMN IF NOT EXISTS auto_rewrite_yellow boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.daily_ops_settings.auto_rewrite_yellow IS
  'V1.11 T4: cron #2 自动给 yellow variants enqueue compliance.auto_rewrite. 默认 true 让 cron 闭环 (而不是客户点 22 次按钮). 设 false 退回 V1.10 仅 D5/D12 reject 触发 auto-rewrite 模式.';
