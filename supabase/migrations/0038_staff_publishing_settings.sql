-- 0038_staff_publishing_settings — V1.11 核心发布号选拔.
--
-- 2026-05-20 用户拍板:每个核心员工号上午 + 下午各发 1 篇.
-- 现状 40 个员工号轮派 → 核心号吃不饱、辅助号 6h 超时再流转,效率低.
--
-- 加 settings jsonb 字段承载:
--   { publishing: { is_active: bool, daily_quota: int } }
--
-- is_active=true  → 派单候选 (dispatcher 新加 H0 过滤).
-- is_active=false → 跳过 (辅助号/潜伏号,不接派单).
-- daily_quota     → per-staff 上限,覆盖全局 daily_cap_per_staff.
--                   未设 = fallback 全局值 (保持向后兼容).
--
-- 选 settings 而不是顶层 is_active 列:
-- (1) 后续 V2 SaaS 化要加更多发布策略 (发布时段 / 平台偏好 / 频率限速),
--     一律塞 settings.publishing.* 而不是不停加列.
-- (2) JSONB 默认 '{}' 不会破坏现有读路径 (40 行 staff_accounts).

ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.staff_accounts.settings IS
  'V1.11: 发布策略 + 后续策略扩展槽. { publishing: { is_active: bool, daily_quota: int } }. 派单 dispatcher H0 过滤 is_active !== false.';

-- 部分索引: 加速 dispatcher 查"租户下所有 is_active 员工号"的热路径.
-- 注意 settings -> 'publishing' -> 'is_active' 是 jsonb 路径,jsonb_path_ops 索引不适用.
-- 用表达式索引 + WHERE clause: 只索引 is_active = true 的行,占用最小.
CREATE INDEX IF NOT EXISTS staff_accounts_publishing_active_idx
  ON public.staff_accounts (tenant_id)
  WHERE (settings #>> '{publishing,is_active}')::boolean IS TRUE
    AND status = 'active'
    AND deleted_at IS NULL;
