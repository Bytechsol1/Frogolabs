import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function createCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const origins = new Set<string>();
  for (const entry of (env.CORS_ORIGINS ?? '').split(',').filter(value => value.trim())) {
    const value = entry.trim();
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) {
      throw new Error('CORS_ORIGINS must contain exact HTTP(S) origins, without paths or wildcards.');
    }
    origins.add(url.origin);
  }
  if (env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }
  return {
    // Server-to-server requests (Next.js proxy and Terra) have no browser origin.
    origin: (origin, callback) => callback(null, !origin || origins.has(origin)),
    credentials: false, // Authentication uses Authorization: Bearer, not cookies.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  };
}
