/**
 * Helper to determine the true external base URL / origin of an incoming request.
 *
 * When behind a reverse proxy (e.g. Tailscale Funnel, Caddy, Nginx),
 * `request.url` may be http://0.0.0.0:4300 or 127.0.0.1, which causes redirects
 * (`NextResponse.redirect(new URL(..., request.url))`) to send the user's browser
 * to an unreachable loopback or 0.0.0.0 address.
 */
export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get('host');
  if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
    const proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https:') ? 'https' : 'http');
    return `${proto}://${host}`;
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  }

  return new URL(request.url).origin;
}
