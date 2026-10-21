import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/server-only packages stay out of client bundles.
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    serverActions: {
      // Loan and DMDC files can exceed the 1 MB default.
      bodySizeLimit: "11mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
