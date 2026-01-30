/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for native modules
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'playwright'],
  },

  // Webpack configuration to handle Anthropic SDK
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle these on the server
      config.externals = config.externals || [];
      config.externals.push('better-sqlite3');
    }
    return config;
  },
};

export default nextConfig;
