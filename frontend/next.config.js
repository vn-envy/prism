/** @type {import('next').NextConfig} */

const useLocalBackend =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_USE_LOCAL_BACKEND === "true";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Only proxy to the Python FastAPI backend when running locally with
    // NEXT_PUBLIC_USE_LOCAL_BACKEND=true.  On Vercel (or when the env var is
    // absent), the /api/* routes are handled by Next.js serverless functions.
    if (useLocalBackend) {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:8000/:path*",
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
