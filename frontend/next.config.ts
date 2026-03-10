// frontend/next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // THIS IS THE FIX: Tells Next.js to let the browser load local images directly
    unoptimized: true, 
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/**', 
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '8000',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;