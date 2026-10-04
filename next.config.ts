import type { NextConfig } from "next";

const embedFrameAncestors = process.env.NODE_ENV === "development"
  ? "frame-ancestors 'self' https://hkuway.com https://www.hkuway.com http://127.0.0.1:* http://localhost:*"
  : "frame-ancestors 'self' https://hkuway.com https://www.hkuway.com";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: embedFrameAncestors,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
