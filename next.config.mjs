// Directives that cannot break page rendering are enforced now. The full policy
// (script/style/connect restrictions) runs report-only until it has been
// observed in production without violations, then it can be moved to enforcing.
const enforcedCsp = [
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://va.vercel-scripts.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: enforcedCsp },
  { key: 'Content-Security-Policy-Report-Only', value: reportOnlyCsp },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Vercel serves static and prerendered responses with a wildcard
        // Access-Control-Allow-Origin. Nothing loads these pages cross-origin, so
        // pin it to the canonical site; same-origin requests ignore this header.
        source: '/((?!api/).*)',
        headers: [{ key: 'Access-Control-Allow-Origin', value: 'https://callsigns.net' }],
      },
    ]
  },
}

export default nextConfig
