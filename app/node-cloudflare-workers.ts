// Node.js compatibility shim used only by the standard Next.js build.
// The Vinext/Sites build continues to resolve the real Cloudflare module.
export const env: any = new Proxy(
  {},
  {
    get(_target, property) {
      return process.env[String(property)];
    },
  },
);
