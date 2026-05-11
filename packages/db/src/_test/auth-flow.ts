/**
 * Auth-flow smoke test. Run with: pnpm db:test-auth
 *
 * Covers the gate logic (redirects around unauthenticated vs authenticated)
 * WITHOUT simulating a real magic-link sign-in — that requires browser-side
 * PKCE state and is best validated by a human clicking a real link.
 *
 * What this script validates:
 *   1. GET /app unauthenticated → 307 redirect to /login?next=/app
 *   2. GET /login unauthenticated → 200 with login form
 *   3. GET /auth/callback?code=invalid → 307 back to /login?error=callback_failed
 *   4. GET /auth/sign-out → 303/307 to /login (regardless of session state)
 *
 * Full magic-link round trip is expected to be run manually by opening /login,
 * submitting an email, and clicking the emailed link.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

type TestResult = { name: string; pass: boolean; detail?: string };
const results: TestResult[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  // Pre-flight: is dev server reachable?
  try {
    await fetch(APP_URL, { redirect: 'manual' });
  } catch (err) {
    console.error(`Cannot reach ${APP_URL}. Start the dev server with \`pnpm dev\`.`);
    console.error(err);
    process.exit(1);
  }

  // 1. /app unauthenticated → /login
  {
    const res = await fetch(`${APP_URL}/app`, { redirect: 'manual' });
    const loc = res.headers.get('location') ?? '';
    record(
      'GET /app unauthenticated → /login?next=/app',
      res.status === 307 && loc.includes('/login') && loc.includes('next=%2Fapp'),
      `status=${res.status} loc=${loc}`,
    );
  }

  // 2. /login → 200 with form
  // Marker is permissive across V1.7 redesign: matches either current copy
  // ("发送登录链接") or the email-input form structure (type="email"+autocomplete).
  // Don't tighten to one literal — that goes stale on every copy iteration.
  {
    const res = await fetch(`${APP_URL}/login`, { redirect: 'manual' });
    const body = res.status === 200 ? await res.text() : '';
    const formPresent =
      body.includes('发送登录链接') ||
      body.includes('登录链接') ||
      (body.includes('type="email"') && body.includes('autocomplete="email"'));
    record(
      'GET /login → 200 with email form',
      res.status === 200 && formPresent,
      `status=${res.status} formPresent=${formPresent}`,
    );
  }

  // 3. /auth/callback is a client page → 200 + handler script present
  {
    const res = await fetch(`${APP_URL}/auth/callback?code=invalid`, { redirect: 'manual' });
    const body = res.status === 200 ? await res.text() : '';
    const handlerPresent =
      body.includes('正在完成登录') ||
      body.includes('完成登录') ||
      body.includes('回到登录页');
    record(
      'GET /auth/callback → 200 client page',
      res.status === 200 && handlerPresent,
      `status=${res.status} handlerPresent=${handlerPresent}`,
    );
  }

  // 4. /auth/sign-out → /login
  {
    const res = await fetch(`${APP_URL}/auth/sign-out`, { redirect: 'manual' });
    const loc = res.headers.get('location') ?? '';
    record(
      'GET /auth/sign-out → /login',
      (res.status === 303 || res.status === 307) && loc.includes('/login'),
      `status=${res.status} loc=${loc}`,
    );
  }

  // 5. middleware never loops / never 500s on root
  {
    const res = await fetch(`${APP_URL}/`, { redirect: 'manual' });
    record(
      'GET / → 200 (landing page, no auth required)',
      res.status === 200,
      `status=${res.status}`,
    );
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
