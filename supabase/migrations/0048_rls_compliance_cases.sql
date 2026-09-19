-- 0048 — compliance_cases 补 RLS（D76,2026-09-19）
--
-- D62 补 RLS 时判了 3 张漏网表,漏了这一张。实测(2026-09-19):
--   relrowsecurity=f, 0 policy
--   anon 与 authenticated 均持有 INSERT/SELECT/UPDATE/DELETE/TRUNCATE
--
-- 这张表是第三道合规门的判例锚（真实罚单）。PostgREST 一旦不再只绑 localhost,
-- 任何人可以投毒或直接 TRUNCATE 掉整个判例库 —— 而合规门会安静地继续"通过"。
--
-- 它没有 tenant_id（是跨租户共享的公共判例库），所以策略不是租户隔离，
-- 而是「登录用户可读、谁都不可写」。写入只走 service_role（bypassrls），
-- 已确认唯一读取方 apps/worker/src/jobs/compliance-review.ts:121 用的就是 service client。

ALTER TABLE public.compliance_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_cases FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_cases_read ON public.compliance_cases;
CREATE POLICY compliance_cases_read
  ON public.compliance_cases
  FOR SELECT
  TO authenticated
  USING (true);

-- 不给任何 INSERT/UPDATE/DELETE policy —— 开了 RLS 又没 policy = 写入一律拒绝。
-- 收回多余的表级授权（anon 连读都不需要：判例库不对匿名开放）
REVOKE ALL ON public.compliance_cases FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.compliance_cases FROM authenticated;
