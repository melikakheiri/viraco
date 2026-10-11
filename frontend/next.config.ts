import type { NextConfig } from 'next';
const nextConfig: NextConfig = { async rewrites() { return [{ source: '/api/v1/:path*', destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/v1/:path*` }]; } };
export default nextConfig;
