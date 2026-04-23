-- ============================================================================
-- 0002_tenant_bootstrap.sql
-- Self-service tenant creation for onboarding.
-- Uses SECURITY DEFINER so authenticated users can atomically:
--   1. Create a new tenants row (RLS would otherwise block INSERT)
--   2. Insert themselves as the 'owner' membership
-- without the web app ever holding the service_role_key.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_tenant_as_owner(
  p_name text,
  p_slug text,
  p_industry text DEFAULT 'other'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated' USING ERRCODE = '42501';
  END IF;

  -- slug sanity: lowercase a-z 0-9 hyphen, 3-40 chars
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Invalid slug: must be 3-40 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Tenant name too short' USING ERRCODE = '22023';
  END IF;

  -- Validate industry enum membership (cast will fail if invalid)
  PERFORM p_industry::public.industry;

  INSERT INTO public.tenants (name, slug, industry)
  VALUES (trim(p_name), p_slug, p_industry::public.industry)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
  VALUES (v_tenant_id, v_user_id, 'owner');

  RETURN v_tenant_id;
END;
$$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.create_tenant_as_owner(text, text, text) TO authenticated;
