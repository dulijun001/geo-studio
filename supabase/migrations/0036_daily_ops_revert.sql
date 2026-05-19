-- 0036_daily_ops REVERT — 一键回滚 0036_daily_ops.sql.
--
-- 用法:
--   psql "$DATABASE_URL" --single-transaction -f supabase/migrations/0036_daily_ops_revert.sql
--
-- 顺序:跟 0036_daily_ops.sql 反向(content_variants 列 → RPC → settings → runs).
-- IF EXISTS 让重复跑不挂.

BEGIN;

-- ── 5. 默认配置回填 — 由 DROP TABLE daily_ops_settings 一并清除,无需单独处理.

-- ── 4. RPC: daily_ops_pick_topics
DROP FUNCTION IF EXISTS public.daily_ops_pick_topics(uuid, int, int);

-- ── 3. content_variants.daily_run_id 反查列
DROP INDEX IF EXISTS content_variants_daily_run_idx;
ALTER TABLE public.content_variants DROP COLUMN IF EXISTS daily_run_id;

-- ── 2. daily_ops_settings
DROP TABLE IF EXISTS public.daily_ops_settings;

-- ── 1. daily_ops_runs (依赖关系上层,最后删)
DROP INDEX IF EXISTS daily_ops_runs_tenant_date_uq;
DROP INDEX IF EXISTS daily_ops_runs_status_idx;
DROP INDEX IF EXISTS daily_ops_runs_tenant_date_desc_idx;
DROP TABLE IF EXISTS public.daily_ops_runs;

COMMIT;
