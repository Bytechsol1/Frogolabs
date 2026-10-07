import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // API/PDF requests must reach NestJS instead of ngrok's browser warning page.
  // This is an upstream request header, not a secret or a browser response header.
  headers.set('ngrok-skip-browser-warning', 'true');
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/api/:path*', '/uploads/:path*'],
};
