-- 0047 revert — 撤销三张表的 RLS(仅在确认新 policy 误伤 app 时使用)

ALTER TABLE public.customer_identities NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.journey_touchpoints NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.verified_citations NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "customer_identities_read" ON public.customer_identities;--> statement-breakpoint
DROP POLICY IF EXISTS "journey_touchpoints_read" ON public.journey_touchpoints;--> statement-breakpoint
DROP POLICY IF EXISTS "verified_citations_read" ON public.verified_citations;--> statement-breakpoint
DROP POLICY IF EXISTS "verified_citations_write" ON public.verified_citations;--> statement-breakpoint

ALTER TABLE public.customer_identities DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.journey_touchpoints DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.verified_citations DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
