/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Fix for ngrok/tunnel asset loading
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,
  async headers() {
    return [
      {
        // matching all API routes
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "http://127.0.0.1:5500" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ]
      },
      // Static asset caching - immutable for 1 year (these files have fingerprinted names or rarely change)
      {
        source: "/:path*.(ico|svg|png|jpg|jpeg|gif|webp)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Font caching - immutable for 1 year
      {
        source: "/:path*.(woff|woff2|ttf|otf|eot)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Web manifest - cache for 1 week (may be updated occasionally)
      {
        source: "/site.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.len.golf',
      },
      {
        protocol: 'https',
        hostname: 'len.golf',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'platform-lookaside.fbsbx.com',
      },
      {
        protocol: 'https',
        hostname: 'profile.line-scdn.net',
      },
      {
        protocol: 'https',
        hostname: 'bisimqmtxjsptehhqpeg.supabase.co',
      },
    ],
    // Cache optimized images for 30 days to reduce Edge function requests and transformations
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
}

module.exports = nextConfig 