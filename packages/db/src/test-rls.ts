/**
 * RLS verification. Run with: pnpm db:test-rls
 *
 * Validates:
 *   1. anon client cannot read tenants (should return 0 rows, no error)
 *   2. service_role sees demo tenant (baseline sanity)
 *   3. authenticated user without membership cannot read any tenant
 *   4. authenticated user with membership sees only their tenant(s)
 *   5. service-role-only table (tracking_accounts) is invisible to authenticated
 *
 * This is a smoke test, not a fuzz test. Real coverage comes in V1 Week 4+ with proper test infra.
 */
import { createClient } from '@supabase/supabase-js';

type TestResult = { name: string; pass: boolean; detail?: string };

const results: TestResult[] = [];

function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  const badge = pass ? '✓' : '✗';
  const tail = detail ? `  — ${detail}` : '';
  console.log(`${badge} ${name}${tail}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Missing Supabase env vars');
  }

  const anon = createClient(url, anonKey);
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ----- Test 1: anon client cannot read tenants -----
  {
    const { data, error } = await anon.from('tenants').select('id').limit(10);
    const ok = !error && Array.isArray(data) && data.length === 0;
    record(
      'anon: SELECT tenants returns 0 rows',
      ok,
      error ? `unexpected error: ${error.message}` : `got ${data?.length ?? '?'} rows`,
    );
  }

  // ----- Test 2: service_role sees demo tenant -----
  let demoTenantId: string | null = null;
  {
    const { data, error } = await service.from('tenants').select('id, slug').eq('slug', 'demo-dental').limit(1);
    const ok = !error && Array.isArray(data) && data.length === 1;
    if (ok && data) demoTenantId = data[0]!.id;
    record(
      'service_role: SELECT demo-dental tenant returns 1 row',
      ok,
      error ? error.message : `tenant_id=${demoTenantId}`,
    );
  }

  // ----- Test 3: tracking_accounts is invisible to anon -----
  {
    const { data, error } = await anon.from('tracking_accounts').select('id').limit(10);
    const ok = !error && Array.isArray(data) && data.length === 0;
    record(
      'anon: SELECT tracking_accounts returns 0 rows (service-only)',
      ok,
      error ? error.message : `got ${data?.length ?? '?'} rows`,
    );
  }

  // ----- Test 4: compliance_keywords global rows are readable by anon? -----
  // The policy grants SELECT to authenticated (not anon), so anon should get 0.
  {
    const { data, error } = await anon.from('compliance_keywords').select('id').limit(5);
    const ok = !error && Array.isArray(data) && data.length === 0;
    record(
      'anon: SELECT compliance_keywords returns 0 rows (needs authenticated)',
      ok,
      error ? error.message : `got ${data?.length ?? '?'} rows`,
    );
  }

  // ----- Test 5: authenticated-but-no-membership user cannot read tenants -----
  if (demoTenantId) {
    // Create a throwaway user via admin API
    const email = `rls-test-${Date.now()}@example.com`;
    const password = 'rls-test-password-1234';

    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      record('create throwaway user', false, createErr?.message);
    } else {
      const userId = created.user.id;

      // Sign them in as that user (not via admin)
      const authed = createClient(url, anonKey);
      const { error: signInErr } = await authed.auth.signInWithPassword({ email, password });
      if (signInErr) {
        record('signed-in user: login', false, signInErr.message);
      } else {
        // Test 5a: no membership => reads empty
        const { data: t1, error: e1 } = await authed.from('tenants').select('id').limit(10);
        record(
          'authed-without-membership: SELECT tenants returns 0 rows',
          !e1 && t1?.length === 0,
          e1?.message ?? `got ${t1?.length ?? '?'} rows`,
        );

        // Test 5b: grant membership, re-read
        const { error: memErr } = await service.from('tenant_memberships').insert({
          tenant_id: demoTenantId,
          user_id: userId,
          role: 'operator',
        });
        if (memErr) {
          record('grant demo-dental membership', false, memErr.message);
        } else {
          const { data: t2, error: e2 } = await authed.from('tenants').select('id, slug').limit(10);
          const onlyDemo =
            !e2 && t2?.length === 1 && t2[0]?.id === demoTenantId;
          record(
            'authed-with-membership: sees exactly their tenant',
            !!onlyDemo,
            e2?.message ?? `got ${t2?.length ?? '?'} rows (ids=${t2?.map((r) => r.id).join(',')})`,
          );

          // Test 5c: still cannot see tracking_accounts (service-only)
          const { data: ta, error: eTa } = await authed.from('tracking_accounts').select('id').limit(10);
          record(
            'authed-with-membership: tracking_accounts still returns 0 rows',
            !eTa && ta?.length === 0,
            eTa?.message ?? `got ${ta?.length ?? '?'} rows`,
          );
        }
      }

      // Cleanup
      await service.from('tenant_memberships').delete().eq('user_id', userId);
      await service.auth.admin.deleteUser(userId);
    }
  }

  // ----- Summary -----
  console.log('');
  const pass = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`${pass}/${total} checks passed`);
  if (pass !== total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
