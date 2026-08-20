-- 0046_daily_ops_pick_priority_driven — D55 地域分级优先序改为纯 priority 驱动 (2026-08-20).
--
-- 起源:
--   - D55 (2026-08-20) 决策"地域分级反转:城市级(昆明)置顶,区县级降为长尾补充",
--     记录为"songshu 数据级调整,无代码"——**该前提是错的**。
--   - 0043 把地域分级硬编码进 RPC 的 ORDER BY 首关键字(geo_tier ASC),
--     priority 只是第二关键字。把城市级 priority 调到 10、区县级压到 7,
--     在排序里完全不起作用:tier=0(区县)恒整体排在 tier=1(城市)之前。
--   - 2026-08-20 实跑 daily_ops_pick_topics(songshu, 14, 7) 实测:
--     14/14 全部返回"昆明西山区…"区县级题,城市级 0 道 → D55 从未生效。
--
-- 修正:
--   ORDER BY 去掉 geo_tier,改为纯 priority DESC 驱动。分级优先序从代码移回数据,
--   以后再调 A/B 配比只改 priority 数据、不动代码(兑现 D55 的"无代码"承诺,
--   同时符合 D2 配置化——不在代码里写死单租户的业务优先序)。
--
-- WHERE geo_tier < 2 保留不动:
--   C 类无地域纯知识题退出生产是**硬边界**(D44 实测豆包 0 引用 + D48 DeepSeek
--   同样成立),不是可调配比,继续留在代码里防止被 priority 数据意外放行。
--
-- ⚠️ 已知风险与配套(0043 注释预言过,本次一并解决):
--   0043 当初把分级写进 RPC 的理由是"手动调的 priority 会被新题入库覆盖 →
--   分级失效"。该风险在本迁移后依然真实,因为 D52 自动补货
--   (apps/worker/src/lib/topic-replenish.ts) 给所有新题硬编码 priority=9,
--   不分地域级 → 补进来的区县级新题会拿到 9,盖过本迁移给区县级定的 7。
--   ⇒ 本迁移必须与 topic-replenish.ts 的「按地域级赋 priority」改动**一起上线**,
--     否则分级会在 ARK 恢复后数日内被补货流冲垮。
--
-- 关联决策: D31(只选子问题)/ D44(地域三级框架)/ D52(自动补货)/ D55(A-B 反转)。

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
      -- 地域分级仅用于 C 类硬过滤;A/B 优先序已交给 priority 数据(D55)
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
     AND geo_tier < 2  -- D44:无地域纯知识题退出生产(硬边界,不可用 priority 放行)
   ORDER BY priority DESC,        -- D55:A/B 优先序改由数据驱动
            last_used_at ASC NULLS FIRST,
            id ASC
   LIMIT GREATEST(p_limit, 0);
$$;

COMMENT ON FUNCTION public.daily_ops_pick_topics IS
  'V1.13 D55 (0046): 纯 priority 驱动选题.地域分级只保留 C 类(无地域)硬过滤,A/B 优先序交给 priority 数据.SECURITY INVOKER → RLS-aware.';

-- ---------------------------------------------------------------------------
-- Data: 存量子问题 priority 按 D55 分级刷新
--   B 城市级(含"昆明"、不含区县词) → 10  置顶,进优先起草带
--   A 区县/商圈级(含区县词)        → 7   长尾补充,让出每日产能
--   C 无地域                        → 4   已被 RPC 过滤,压低仅为语义一致
-- 只动子问题(parent_id IS NOT NULL);主题题作 GEO 追踪种子,priority 不动。
-- ---------------------------------------------------------------------------

UPDATE public.questions
   SET priority = CASE
         WHEN text ~ '西山区|五华区|盘龙区|官渡区|呈贡区|安宁|东川|晋宁|富民|宜良|石林|嵩明|禄劝|寻甸'
           THEN 7
         WHEN text ~ '昆明'
           THEN 10
         ELSE 4
       END
 WHERE deleted_at IS NULL
   AND parent_id IS NOT NULL;
