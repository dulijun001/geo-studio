-- revert 0048
ALTER TABLE public.compliance_cases NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_cases DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compliance_cases_read ON public.compliance_cases;
GRANT ALL ON public.compliance_cases TO anon, authenticated;
