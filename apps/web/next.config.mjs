/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone copies only runtime files into .next/standalone — keeps the
  // production deploy lean (~150MB vs ~1.2GB with full node_modules).
  // Required for the ECS deploy flow in ops/deploy/.
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@geo/db', '@geo/shared', '@geo/geo-core'],
  experimental: {
    // pnpm monorepo: pin the trace root to the repo so standalone bundles
    // workspace siblings (@geo/db, @geo/shared, @geo/geo-core) correctly.
    // Next 14.3+ promotes this to top-level; 14.2 keeps it under experimental.
    outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
    // Behind a reverse proxy (Caddy → 127.0.0.1:3000), trust the Host
    // header so request.nextUrl.host reflects the public hostname instead
    // of the bind address. Without this, NextResponse.redirect() composes
    // URLs against `process.env.HOSTNAME` (127.0.0.1) and the browser
    // gets bounced to localhost:3000.
    trustHostHeader: true,
    serverActions: {
      bodySizeLimit: '10mb', // Word/PDF uploads go through Storage signed URLs, not server actions
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.volcengine.com' },
    ],
  },
};

export default nextConfig;
