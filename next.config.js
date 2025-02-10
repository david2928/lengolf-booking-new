/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    domains: [
      'www.len.golf',
      'len.golf',
      'lh3.googleusercontent.com',
      'platform-lookaside.fbsbx.com',
      'profile.line-scdn.net'
    ],
  },
}

module.exports = nextConfig 