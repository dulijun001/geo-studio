/**
 * Dev-only: mint a magic link for the given email, bypass the free-tier
 * email rate limit. Uses the admin API, which does NOT send an email.
 *
 * Usage: pnpm db:dev-link <email>
 *
 * Copy the printed URL into a browser; the callback will establish a session
 * and drop you into /app or the specified next path.
 */
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
const nextPath = process.argv[3] ?? '/app';

if (!email) {
  console.error('Usage: pnpm db:dev-link <email> [next-path]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
if (!url || !serviceKey) throw new Error('Missing Supabase env vars');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  // Ensure user exists (admin.generateLink with magiclink requires existing user)
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email === email);

  if (!found) {
    console.log(`User ${email} not found, creating…`);
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createErr) throw new Error(`createUser: ${createErr.message}`);
  }

  const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email as string,
    options: { redirectTo },
  });
  if (error || !data?.properties?.action_link) {
    throw new Error(`generateLink: ${error?.message ?? 'no link returned'}`);
  }

  console.log('');
  console.log('Copy this URL into your browser to log in:');
  console.log('');
  console.log(data.properties.action_link);
  console.log('');
  console.log('(The link expires in ~1 hour. No email was sent.)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
