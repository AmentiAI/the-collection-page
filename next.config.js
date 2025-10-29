/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable static optimization to prevent SSR issues with client-only libraries
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@omnisat/lasereyes'],
  },
}

module.exports = nextConfig
