import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  // This app lives in a sub-folder of the portfolio repo; pin the root so Next
  // doesn't pick up the parent lockfile.
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
