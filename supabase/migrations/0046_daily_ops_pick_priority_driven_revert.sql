-- 0046 revert — 回到 0043 的 geo_tier ASC 硬编码排序(区县级置顶).
--
-- 何时用:D55 复盘条件触发时——积累 ≥20 篇城市级已发布题后,按 docs/11 口径
--   重跑「发布→被引」ID 级匹配,若城市级被引率仍显著低于区县级(D44 原始实测
--   结论:区县级 50% 被采用 / 城市级 0 采用),回滚本条恢复区县级置顶。
--
-- ⚠️ 回滚 RPC 后,priority 数据仍是 D55 刷过的值(城市 10 / 区县 7),
--   但 geo_tier ASC 会重新压过 priority,区县级自动回到置顶——行为等价于 0043。
--   若要连数据一起回滚,取消下方 UPDATE 的注释。

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
  WITH q_with_meta AS (
    SELECT
      q.id,
      q.text,
      q.intent::text,
      q.priority,
      CASE
        WHEN q.text ~ '西山区|五华区|盘龙区|官渡区|呈贡区|安宁|东川|晋宁|富民|宜良|石林|嵩明|禄劝|寻甸'
          THEN 0
        WHEN q.text ~ '昆明'
          THEN 1
        ELSE 2
      END AS geo_tier,
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
      AND q.parent_id IS NOT NULL
      AND q.active = true
  )
  SELECT id, text, intent, priority, last_used_at
    FROM q_with_meta
   WHERE (last_used_at IS NULL
          OR last_used_at < now() - (p_exclude_days || ' days')::interval)
     AND geo_tier < 2
   ORDER BY geo_tier ASC,
            priority DESC,
            last_used_at ASC NULLS FIRST,
            id ASC
   LIMIT GREATEST(p_limit, 0);
$$;

COMMENT ON FUNCTION public.daily_ops_pick_topics IS
  'V1.12 D44 (0043): 地域分级选题.区县词 geo_tier=0 置顶 > 城市级=1 > 无地域=2 过滤.再 priority desc + last_used asc.SECURITY INVOKER → RLS-aware.';

-- 连数据一起回滚(D44 原始配比:区县 priority+2 封顶 10 / 城市 7 / 无地域 4):
-- UPDATE public.questions
--    SET priority = CASE
--          WHEN text ~ '西山区|五华区|盘龙区|官渡区|呈贡区|安宁|东川|晋宁|富民|宜良|石林|嵩明|禄劝|寻甸'
--            THEN 10
--          WHEN text ~ '昆明'
--            THEN 7
--          ELSE 4
--        END
--  WHERE deleted_at IS NULL
--    AND parent_id IS NOT NULL;
