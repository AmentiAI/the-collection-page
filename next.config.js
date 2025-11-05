/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@omnisat/lasereyes', '@omnisat/lasereyes-core', '@omnisat/lasereyes-react', 'pg'],                                            
  },
  webpack: (config, { isServer, dev }) => {
    // Exclude problematic packages from server-side bundle
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        '@omnisat/lasereyes': 'commonjs @omnisat/lasereyes',
        '@omnisat/lasereyes-core': 'commonjs @omnisat/lasereyes-core',
        '@omnisat/lasereyes-react': 'commonjs @omnisat/lasereyes-react',
      })
    }
    
    config.resolve.fallback = {
      ...config.resolve.fallback,
      // Only set these to false for client-side builds
      ...(isServer ? {} : {
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      }),
    }
    
    // Fix webpack chunk loading issues in dev mode
    if (dev) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'named',
        chunkIds: 'named',
      }
      
      // Improve chunk splitting
      config.output = {
        ...config.output,
        chunkFilename: dev ? 'static/chunks/[name].js' : 'static/chunks/[name].[contenthash].js',
      }
    }
    
    return config
  },
}

module.exports = nextConfig
