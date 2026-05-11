/**
 * Content upload + parse end-to-end smoke test.
 * Run: pnpm db:test-content
 *
 * Requires web dev server AND worker to be running.
 *
 * Validates:
 *   1. Storage RLS: anon cannot list content-uploads bucket
 *   2. Storage RLS: user A cannot write to tenant B's path
 *   3. Happy path: create row → upload → enqueue → worker parses → markdown populated
 */
import { createClient } from '@supabase/supabase-js';
import PgBoss from 'pg-boss';
import { setupTestGuard } from './_runner';

setupTestGuard({ timeoutMs: 90_000 });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!url || !anonKey || !serviceKey || !databaseUrl) throw new Error('Missing env');

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  // Test 1: anon cannot list bucket contents
  {
    const anon = createClient(url!, anonKey!);
    const { data, error } = await anon.storage.from('content-uploads').list('');
    record(
      'anon: list content-uploads bucket returns empty / denied',
      !!error || !data || data.length === 0,
      error?.message ?? `got ${data?.length ?? 0} items`,
    );
  }

  // Set up two tenants + two users for cross-tenant test
  const emailA = `content-a-${Date.now()}@example.com`;
  const emailB = `content-b-${Date.now()}@example.com`;
  const password = 'content-test-password-1234';

  const { data: uaRes } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  const { data: ubRes } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  const userA = uaRes!.user!.id;
  const userB = ubRes!.user!.id;

  const clientA = createClient(url!, anonKey!);
  const clientB = createClient(url!, anonKey!);
  await clientA.auth.signInWithPassword({ email: emailA, password });
  await clientB.auth.signInWithPassword({ email: emailB, password });

  const suffix = Date.now().toString().slice(-8);
  const { data: tA } = await clientA.rpc('create_tenant_as_owner', {
    p_name: 'TA',
    p_slug: `content-a-${suffix}`,
    p_industry: 'dental',
  });
  const { data: tB } = await clientB.rpc('create_tenant_as_owner', {
    p_name: 'TB',
    p_slug: `content-b-${suffix}`,
    p_industry: 'dental',
  });
  const tenantA = tA as string;
  const tenantB = tB as string;

  const contentItemId = crypto.randomUUID();

  try {
    // Test 2: user A cannot upload to tenant B's path
    {
      const bytes = new TextEncoder().encode('cross-tenant probe');
      const { error } = await clientA.storage
        .from('content-uploads')
        .upload(`${tenantB}/${contentItemId}.txt`, bytes, {
          contentType: 'text/plain',
        });
      record(
        'user A upload to tenant B path → denied',
        !!error,
        error?.message.slice(0, 80) ?? 'upload unexpectedly succeeded',
      );
    }

    // Test 3: end-to-end happy path
    // (a) insert content_items row via service (mimics the server action)
    const { error: insErr } = await admin.from('content_items').insert({
      id: contentItemId,
      tenant_id: tenantA,
      title: 'RLS test doc',
      source_type: 'manual',
      status: 'draft',
      markdown: '',
    });
    if (insErr) throw new Error(`insert: ${insErr.message}`);

    const storagePath = `${tenantA}/${contentItemId}.txt`;
    const sample = '这是一段口腔科普测试内容。种植牙术后应保持清洁,避免进食过硬食物。';
    const { error: upErr } = await clientA.storage
      .from('content-uploads')
      .upload(storagePath, new TextEncoder().encode(sample), {
        contentType: 'text/plain',
        upsert: true,
      });
    record('user A upload to own tenant path → success', !upErr, upErr?.message);

    // Set source_url
    await admin.from('content_items').update({ source_url: storagePath }).eq('id', contentItemId);

    // Enqueue
    const boss = new PgBoss({ connectionString: databaseUrl!, schema: 'pgboss' });
    await boss.start();
    await boss.createQueue('content.parse');
    await boss.send('content.parse', {
      content_item_id: contentItemId,
      tenant_id: tenantA,
      storage_path: storagePath,
      mime_type: 'text/plain',
    });
    await boss.stop({ graceful: true, timeout: 5000 });

    // Poll content_items until status flips to 'parsed' or 30s timeout
    const deadline = Date.now() + 30_000;
    let finalStatus: string | undefined;
    let finalMarkdown: string | undefined;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const { data: row } = await admin
        .from('content_items')
        .select('status, markdown')
        .eq('id', contentItemId)
        .single();
      if (row?.status === 'parsed') {
        finalStatus = row.status;
        finalMarkdown = row.markdown;
        break;
      }
      finalStatus = row?.status;
    }

    record(
      'worker parsed content → status=parsed',
      finalStatus === 'parsed',
      `final status=${finalStatus}`,
    );
    record(
      'worker parsed content → markdown contains original text',
      !!finalMarkdown && finalMarkdown.includes('种植牙'),
      `markdown length=${finalMarkdown?.length ?? 0}`,
    );
  } finally {
    // Cleanup
    await admin.storage.from('content-uploads').remove([
      `${tenantA}/${contentItemId}.txt`,
    ]);
    await admin.from('content_items').delete().eq('id', contentItemId);
    await admin.from('tenant_memberships').delete().in('tenant_id', [tenantA, tenantB]);
    await admin.from('tenants').delete().in('id', [tenantA, tenantB]);
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
