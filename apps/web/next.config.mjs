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
