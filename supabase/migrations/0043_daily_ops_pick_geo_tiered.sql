-- 0043_daily_ops_pick_geo_tiered — D44 地域分级选题代码化 (2026-06-15).
--
-- 起源:
--   - D44 (2026-06-11) 决策"选题按地域分级重排:区县级置顶、城市级让位、
--     无地域纯知识题退出生产",但当时是手动 SQL 调 priority 落地,没写进 RPC。
--   - 问题:手动调的 priority 会被 0042 的 backfill(子问题 priority 继承父题)
--     和新题入库覆盖 → 分级失效,城市大词/纯知识题又混进每日选题。
--   - 2026-06-15 豆包真机实测 5 道高频题铁证(见 memory
--     project-doubao-citation-empirics-20260615):带"西山区"区县词题松鼠 3/3
--     被推荐排私立第一;不带区县词的城市大词 0/2 全输(豆包只信全国权威医疗库,
--     本地诊所无入场资格)。无地域纯知识题豆包用医典答,本地内容 0 引用。
--
-- 修正:
--   把地域分级写进 RPC 排序逻辑,实时按 text 里的地域词判级,不依赖手动 priority:
--     A 区县级(西山区等14区县) → geo_tier=0(最优先)
--     B 城市级(只有"昆明"无区县) → geo_tier=1
--     C 无地域纯知识题 → 直接过滤不选(WHERE 排除)
--   排序:geo_tier ASC(区县优先) → priority DESC → last_used_at ASC → id。
--
-- 为什么过滤 C 类而不是降权:实测 C 类豆包 0 引用,留着只会浪费 LLM 起草成本
--   (~$0.1/篇)。城市级 B 类保留(让位但不退出)——它仍可能在某些长尾组合命中。
--
-- 关联决策: D31(只选子问题)/ D42(featured doctor)/ D44(地域分级)/
--   2026-06-15 豆包实测。延续 0042 的 parent_id IS NOT NULL + active 过滤。

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
      -- D44 地域分级:区县词命中=0(置顶),只有"昆明"=1,无地域=2(过滤)
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
      AND q.parent_id IS NOT NULL  -- D31 (0042):只选子问题
      AND q.active = true
  )
  SELECT id, text, intent, priority, last_used_at
    FROM q_with_meta
   WHERE (last_used_at IS NULL
          OR last_used_at < now() - (p_exclude_days || ' days')::interval)
     AND geo_tier < 2  -- D44:无地域纯知识题退出生产(豆包 0 引用)
   ORDER BY geo_tier ASC,         -- D44:区县级置顶
            priority DESC,
            last_used_at ASC NULLS FIRST,
            id ASC
   LIMIT GREATEST(p_limit, 0);
$$;

COMMENT ON FUNCTION public.daily_ops_pick_topics IS
  'V1.12 D44 (0043): 地域分级选题.区县词 geo_tier=0 置顶 > 城市级=1 > 无地域=2 过滤.再 priority desc + last_used asc.SECURITY INVOKER → RLS-aware.';
