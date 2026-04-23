/**
 * Tenant routing + RPC smoke test. Run: pnpm db:test-tenant
 *
 * Validates:
 *   1. GET /app unauthenticated → /login
 *   2. GET /t/any-slug unauthenticated → /login?next=/t/any-slug
 *   3. RPC create_tenant_as_owner with invalid slug → error
 *   4. RPC create_tenant_as_owner with valid input → returns uuid; caller becomes owner
 *   5. After creation, the creator can SELECT the new tenant (RLS pass-through)
 *   6. A separate user who is NOT a member cannot SELECT it (RLS block)
 *   7. Creator can delete the membership (cleanup)
 */
import { createClient } from '@supabase/supabase-js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

type TestResult = { name: string; pass: boolean; detail?: string };
const results: TestResult[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Missing Supabase env vars');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // --- Test 1: /app unauth → /login ---
  {
    try {
      const res = await fetch(`${APP_URL}/app`, { redirect: 'manual' });
      const loc = res.headers.get('location') ?? '';
      record('GET /app unauth → /login', res.status === 307 && loc.includes('/login'),
        `status=${res.status} loc=${loc}`);
    } catch (err) {
      record('GET /app unauth → /login', false, `fetch failed: ${String(err)}`);
    }
  }

  // --- Test 2: /t/[slug] unauth → /login?next=... ---
  {
    try {
      const res = await fetch(`${APP_URL}/t/some-slug`, { redirect: 'manual' });
      const loc = res.headers.get('location') ?? '';
      record(
        'GET /t/some-slug unauth → /login?next=/t/some-slug',
        res.status === 307 && loc.includes('/login') && loc.includes('next=%2Ft%2Fsome-slug'),
        `status=${res.status} loc=${loc}`,
      );
    } catch (err) {
      record('GET /t/some-slug unauth', false, `fetch failed: ${String(err)}`);
    }
  }

  // --- Set up two throwaway users ---
  const emailA = `tenant-flow-a-${Date.now()}@example.com`;
  const emailB = `tenant-flow-b-${Date.now()}@example.com`;
  const password = 'tenant-flow-password-1234';

  const { data: ua } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
  });
  const { data: ub } = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
  });
  if (!ua?.user || !ub?.user) throw new Error('Failed to create throwaway users');

  const userA = ua.user.id;
  const userB = ub.user.id;

  const clientA = createClient(url, anonKey);
  const clientB = createClient(url, anonKey);
  await clientA.auth.signInWithPassword({ email: emailA, password });
  await clientB.auth.signInWithPassword({ email: emailB, password });

  const uniqueSuffix = Date.now().toString().slice(-8);
  const validSlug = `test-tenant-${uniqueSuffix}`;
  let newTenantId: string | null = null;

  try {
    // --- Test 3: invalid slug rejected ---
    {
      const { error } = await clientA.rpc('create_tenant_as_owner', {
        p_name: 'Bad',
        p_slug: 'UPPER',
        p_industry: 'dental',
      });
      record(
        'RPC create_tenant_as_owner rejects uppercase slug',
        !!error,
        error ? error.message.slice(0, 80) : 'no error returned',
      );
    }

    // --- Test 4: valid creation ---
    {
      const { data, error } = await clientA.rpc('create_tenant_as_owner', {
        p_name: 'Test Tenant',
        p_slug: validSlug,
        p_industry: 'dental',
      });
      const ok = !error && typeof data === 'string' && data.length === 36;
      if (ok) newTenantId = data as string;
      record('RPC create_tenant_as_owner success', ok,
        error ? error.message : `tenant_id=${data}`);
    }

    if (newTenantId) {
      // --- Test 5: creator can read ---
      {
        const { data, error } = await clientA
          .from('tenants')
          .select('id, slug, name')
          .eq('id', newTenantId)
          .single();
        record('Creator SELECT on their new tenant',
          !error && data?.id === newTenantId,
          error?.message ?? `got id=${data?.id}`);
      }

      // --- Test 6: non-member cannot read ---
      {
        const { data, error } = await clientB
          .from('tenants')
          .select('id')
          .eq('id', newTenantId);
        const ok = !error && Array.isArray(data) && data.length === 0;
        record('Non-member SELECT returns 0 rows (RLS)',
          ok,
          error?.message ?? `got ${data?.length ?? '?'} rows`);
      }

      // --- Test 7: owner role stored correctly ---
      {
        const { data, error } = await clientA
          .from('tenant_memberships')
          .select('role')
          .eq('tenant_id', newTenantId)
          .eq('user_id', userA)
          .single();
        record('Creator has owner role in tenant_memberships',
          !error && data?.role === 'owner',
          error?.message ?? `role=${data?.role}`);
      }
    }
  } finally {
    // Cleanup
    if (newTenantId) {
      await admin.from('tenant_memberships').delete().eq('tenant_id', newTenantId);
      await admin.from('tenants').delete().eq('id', newTenantId);
    }
    await admin.auth.admin.deleteUser(userA);
    await admin.auth.admin.deleteUser(userB);
  }

  console.log('');
  const pass = results.filter((r) => r.pass).length;
  console.log(`${pass}/${results.length} checks passed`);
  if (pass !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
