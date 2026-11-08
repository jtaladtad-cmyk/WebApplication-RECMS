import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  // Pin the project root so Next never picks up a lockfile from a parent folder.
  turbopack: { root },
  outputFileTracingRoot: root,
  experimental: {
    serverActions: {
      // Research protocols + consent forms can exceed the 1MB default.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
