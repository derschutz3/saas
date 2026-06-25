const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const nextConfig = {
  reactStrictMode: true,
  // PERF: comprime assets servidos pelo Next.js (JS, CSS, HTML).
  // O backend já gzip o response de API, mas o Next devolve o JS do bundle sem compress.
  // Em produção o Next usa gzip automaticamente, mas em dev ativamos explicitamente.
  compress: true,
  // PERF: otimiza imagens (prepara formato WebP, redimensiona on-demand).
  images: {
    formats: ['image/avif', 'image/webp'],
    // Mantém imagens em cache por 60s no cliente e 30 dias no servidor
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  // PERF: productionBrowserSourceMaps false para reduzir tamanho do bundle
  productionBrowserSourceMaps: false,
  async rewrites() {
    return [
      {
        source: '/api/integrations/:path*',
        destination: `${apiBase}/integrations/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ]
  },
  // PERF: headers HTTP cacheáveis (immutable para chunks de build)
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
  // PERF: experimental flags úteis para performance
  experimental: {
    // Otimização de package imports (tree-shake lucide-react, etc)
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
