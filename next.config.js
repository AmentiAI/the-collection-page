/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable static optimization to prevent SSR issues with client-only libraries
  output: 'standalone',
  webpack: (config, { isServer }) => {
    // Exclude problematic packages from server-side bundle
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        '@omnisat/lasereyes': 'commonjs @omnisat/lasereyes',
        '@omnisat/lasereyes-core': 'commonjs @omnisat/lasereyes-core',
        '@omnisat/lasereyes-react': 'commonjs @omnisat/lasereyes-react',
      })
    }
    
    // Don't alias on client - let it load in separate chunk
    
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    }
    
    return config
  },
  experimental: {
    serverComponentsExternalPackages: ['@omnisat/lasereyes', '@omnisat/lasereyes-core', '@omnisat/lasereyes-react'],
  },
}

module.exports = nextConfig
