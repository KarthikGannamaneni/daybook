import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: ['@khata/parser', '@khata/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion'],
  },
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
