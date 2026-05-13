-- 0033_draft_batches_d21: D21 plumbing for batch path.
--
-- query_intent 整批共享(一批通常同主题,语义合理放在 batch 层)
-- primary_query 每题独立 → 由 worker 从 question.text / item.topic 派生,
--   不存在 batch 表 nor item 表(节省存储)
--
-- 入 NULL = legacy V1.9 路径,无 D21 强约束. 非 NULL = D21 标准路径,
-- worker 透传给 /api/internal/ai-draft → ai-draft-core SYSTEM_PROMPT 加
-- intentBlock(P1-3 已支持入参).

ALTER TABLE public.draft_batches
  ADD COLUMN IF NOT EXISTS query_intent text
    CHECK (query_intent IS NULL OR query_intent IN (
      'what_is','is_it_true','which_is_better','why_happens',
      'what_to_do','how_long','when_to_seek_care','how_to_choose_local'
    ));

COMMENT ON COLUMN public.draft_batches.query_intent IS
  'D21 / ADR 009: optional batch-wide intent. NULL = legacy path (no D21 anchoring); NOT NULL = each item passes intent + topic-as-primary_query into prompt-builder.';
