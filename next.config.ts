import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack(config) {
    config.resolve.alias["runtime-env"] = path.resolve(
      process.cwd(),
      "app/node-cloudflare-workers.ts",
    );
    return config;
  },
};

export default nextConfig;
