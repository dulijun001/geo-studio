-- 0023_staff_kind_column: split "staff_accounts" semantics into doctor vs
--   operator.
--
-- Background: V1.5 knowledge-sync auto-imports a staff_accounts row for
-- every "团队/医生/XX.md" file in the customer KB, treating doctors as a
-- pseudo-staff for content signing + persona matching. V1.6 dispatch
-- algorithm then mistakenly considered those doctors as candidates for
-- "publish on Toutiao / Baijiahao" tasks — but doctors are content
-- subjects/authors, not the operators logging into those platforms.
--
-- This migration introduces a `kind` column to make the distinction
-- explicit. Two values:
--   - 'doctor'   : 医生本人;不应该接派单去发外网平台,但仍可用作
--                   - 内容署名(作者代表)
--                   - persona 匹配(种植变体派给种植医生背书)
--   - 'operator' : 真正登录平台账号发布内容的人(运营 / 市场专员等)
--
-- Backfill: existing rows with bio_md_path IS NOT NULL = doctor (came
-- from KB). All others default to operator.

CREATE TYPE staff_kind AS ENUM ('doctor', 'operator');

ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS kind staff_kind NOT NULL DEFAULT 'operator';

-- Backfill: anyone synced from the KB (has bio_md_path) is a doctor.
UPDATE public.staff_accounts
SET kind = 'doctor'
WHERE bio_md_path IS NOT NULL
  AND kind = 'operator';  -- only flip rows that haven't been hand-edited

CREATE INDEX IF NOT EXISTS staff_accounts_kind_idx
  ON public.staff_accounts (tenant_id, kind)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.staff_accounts.kind IS
  'doctor = 医生(用于内容署名 + persona,不接派单);operator = 真正发布账号(接派单)。Backfill: bio_md_path IS NOT NULL → doctor.';
