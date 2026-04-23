/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@geo/db', '@geo/shared'],
  experimental: {
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
