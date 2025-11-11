/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ord-mirror.magiceden.dev',
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
      {
        protocol: 'https',
        hostname: 'media.discordapp.net',
      },
    ],
  },
  experimental: {
    esmExternals: 'loose',
  },
  webpack: (config, { isServer, dev }) => {
    // Exclude problematic packages from server-side bundle
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
    
    config.ignoreWarnings = config.ignoreWarnings || []
    config.ignoreWarnings.push(warning =>
      typeof warning?.message === 'string' &&
      warning.message.includes('require function is used in a way in which dependencies cannot be statically extracted') &&
      warning.module?.resource?.includes('require-in-the-middle')
    )
    
    return config
  },
}

module.exports = nextConfig
