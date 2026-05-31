-- 0042 revert — 回滚到 0036 的"主题题 + 子问题混选"语义.
-- 用法:psql --single-transaction -f 0042_daily_ops_pick_subtopics_only_revert.sql

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
            id ASC
   LIMIT GREATEST(p_limit, 0);
$$;

COMMENT ON FUNCTION public.daily_ops_pick_topics IS
  'V1.10 docs/09 §2.1 topic picker. SECURITY INVOKER → RLS-aware. 排除最近 N 天用过的 question (查 content_items.target_questions[]),按 priority desc + last_used_at asc 排.';
