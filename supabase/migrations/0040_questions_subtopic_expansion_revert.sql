-- Revert 0040.
BEGIN;
DROP INDEX IF EXISTS public.questions_parent_idx;
DROP INDEX IF EXISTS public.questions_root_idx;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_subtopic_source_check;
ALTER TABLE public.questions
  DROP COLUMN IF EXISTS expansion_seed_topic,
  DROP COLUMN IF EXISTS subtopic_source,
  DROP COLUMN IF EXISTS parent_id;
COMMIT;
