import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/internal/mail': ['./public/logo.jpg'],
  },
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? '')
    .split(',').map(origin => origin.trim()).filter(Boolean),
  experimental: {
    proxyClientMaxBodySize: '25mb',
  },
  async rewrites() {
    const value = process.env.BACKEND_URL?.trim();
    if (!value) throw new Error('Set BACKEND_URL to the NestJS backend origin before starting or building the frontend.');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new Error('BACKEND_URL must be an HTTP(S) origin, without credentials or an API path.');
    }
    const backendUrl = url.origin;
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
