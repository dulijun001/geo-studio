-- 0047_rls_pii_tables — 给三张漏网的租户表补 RLS (C3 安全修复 2026-09-01)
--
-- 背景:
--   - 0001 只对立项期的 17 张表 ENABLE + FORCE RLS。0010/0011 后加的
--     verified_citations / customer_identities / journey_touchpoints 三张表
--     在各自 migration 里漏了 RLS。
--   - 实测 (2026-09-01):三表 relrowsecurity=false,且 anon 角色对三表持有
--     完整 INSERT/SELECT/UPDATE/DELETE 授权。customer_identities 存患者手机尾号/notes,
--     journey_touchpoints 存暗号/utm/自报医生 —— 均为 PII。
--   - 目前唯一没被利用的原因是 PostgREST 绑 127.0.0.1 未对外(配置巧合,非策略);
--     历史上 D41 时代 Caddy 曾把 /supabase/* 反代公网,届时即为拿浏览器公开 anon key
--     跨租户直读全部患者数据。
--
-- 方案:按 0001 Class A 模板补 ENABLE + 租户隔离 policy + FORCE。
--   - customer_identities / journey_touchpoints:PII,客户端只读本租户;写入仅走
--     service_role(checkin/归因链路),不给客户端写策略。
--   - verified_citations:白名单文献,本租户可读,owner/admin/operator 可写。
--
-- 安全性:app 侧不受影响 —— 直连角色 postgres 与 service_role 均 bypassrls=t
--   (2026-09-01 实测),FORCE 只挡 anon/authenticated。回滚见 _revert。

ALTER TABLE public.customer_identities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.journey_touchpoints ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.verified_citations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "customer_identities_read" ON public.customer_identities FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint

CREATE POLICY "journey_touchpoints_read" ON public.journey_touchpoints FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint

CREATE POLICY "verified_citations_read" ON public.verified_citations FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
CREATE POLICY "verified_citations_write" ON public.verified_citations FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

ALTER TABLE public.customer_identities FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.journey_touchpoints FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.verified_citations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
