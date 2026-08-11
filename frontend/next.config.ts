import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'da69-2400-adc1-1c1-8500-f455-1078-88cd-947d.ngrok-free.app',
    'cuddly-beers-work.loca.lt',
  ],
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';
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
