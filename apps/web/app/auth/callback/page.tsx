import { Suspense } from 'react';
import { CallbackHandler } from './callback-handler';

/**
 * Auth callback. Accepts two formats:
 *   1. PKCE:     ?code=... (from signInWithOtp in browser)
 *   2. Implicit: #access_token=...&refresh_token=... (from admin.generateLink)
 *
 * Client-side because hash fragments never reach the server.
 */
export default function CallbackPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-24 text-center">
      <Suspense fallback={<p className="text-sm text-muted-foreground">加载中…</p>}>
        <CallbackHandler />
      </Suspense>
    </main>
  );
}
