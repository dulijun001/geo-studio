-- 0042_daily_ops_pick_subtopics_only — V1.12 D31 后续修正(2026-05-27).
--
-- 起源:
--   - 0040_questions_subtopic_expansion(2026-05-23)注释承诺:
--     "daily-ops cron 之后只从 parent_id IS NOT NULL 的子问题里选,
--      粒度更细命中关键词的可能性更大"。
--   - 实际 0036_daily_ops 里的 RPC `daily_ops_pick_topics` 没改,仍把
--     主题题(parent_id IS NULL)+ 子问题(parent_id IS NOT NULL)混在
--     一起按 priority desc 排,主题题 priority=10/9/8 永远排在子问题
--     (默认 5)前面,cron 永远选不到子问题。
--   - 2026-05-27 batch-expand-subtopics 落地 363 子问题后,这个产品 bug
--     才暴露。
--
-- 修正:
--   RPC `daily_ops_pick_topics` 在 from 子句里加 `WHERE q.parent_id IS NOT NULL`,
--   只选子问题。主题题作为 GEO 追踪种子保留(不参与 cron 派单)。
--
-- 数据语义变化:
--   - 主题题:用于 GEO 追踪 + 子问题生成种子(`expansion_seed_topic` 字段保留)
--   - 子问题:用于 daily-ops cron 派单 + 内容生产
--
-- 副作用:
--   - 如果某 tenant 没有任何子问题入库(全是 V1.11 之前的老主题题),
--     cron 会 return 0 rows → daily-ops run 进入 stuck (空 run)。
--     这是预期行为 — 强制客户先跑 batch-expand-subtopics,符合 D31 决策。
--   - 已有 6 个 tenant 没有子问题(songshu 之外的测试租户),它们的 cron 会停。
--     这些是 inactive 测试租户,daily_ops_settings.enabled 都是 false,不影响。
--
-- 关联决策:
--   - D31 (CLAUDE.md):子问题展开是 D31 战术核心
--   - D24 (CLAUDE.md):cron 选题 last_used_at 去重逻辑
--   - 0040 migration 注释承诺
--   - 2026-05-27 batch 跑完 ~540 子问题后立即 apply

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
      AND q.parent_id IS NOT NULL  -- V1.12 D31 (0042):只选子问题
      AND q.active = true           -- 同步加 active filter (原 RPC 漏)
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
  'V1.12 D31 (0042): 只从子问题(parent_id IS NOT NULL)里选,主题题作 GEO 追踪种子留着.SECURITY INVOKER → RLS-aware.priority desc + last_used_at asc + id asc 排.';

-- ──────────────────────────────────────────────────────────────────────
-- Data backfill: 子问题 priority 继承父题(0040 注释承诺,但 batch-expand-
-- subtopics.ts 写错 hardcode priority=5)
--
-- 2026-05-27 batch 跑完 ~363 子问题 priority=5,实际应该等于父题 priority
-- (10/9/8 等).让 cron 在子问题之间也能区分高/低优.
-- ──────────────────────────────────────────────────────────────────────

UPDATE public.questions sub
   SET priority = parent.priority,
       updated_at = now()
  FROM public.questions parent
 WHERE sub.parent_id = parent.id
   AND sub.subtopic_source = 'llm_expand'
   AND sub.deleted_at IS NULL
   AND sub.priority IS DISTINCT FROM parent.priority;
