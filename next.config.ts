import type { NextConfig } from "next";
import path from "node:path";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    // Next.js streams its page data in inline scripts, so scripts need 'unsafe-inline' without a
    // per-request nonce. Everything else is limited to this site.
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 is a native module: load it from node_modules at run time, never bundle it.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack(config) {
    // Only the retired Cloudflare Workers files import "runtime-env"; nothing on the Hostinger
    // path does. Kept so those files still build if they are ever imported again.
    config.resolve.alias["runtime-env"] = path.resolve(process.cwd(), "app/node-cloudflare-workers.ts");
    return config;
  },
};

export default nextConfig;
