// The public coming-soon page keeps its social preview tags. Runs against the Next.js build
// (`npm run build` first); it starts `next start` on a free local port, with no network.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const built = existsSync(path.join(root, ".next", "BUILD_ID"));

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

test("renders production social preview metadata", { skip: built ? false : "no Next.js build: run npm run build first" }, async (t) => {
  const port = await freePort();
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "kp-support-test-"));
  const server = spawn(path.join(root, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, SUPPORT_REQUESTS_ENABLED: "false", SUPPORT_DATA_DIR: dataDir, SUPPORT_URL: "https://support.orderofkpi.com", PORTAL_URL: "", SESSION_SECRET: "test-only-session-secret-0123456789abcdef" },
    stdio: "ignore",
  });
  t.after(() => {
    server.kill();
    rmSync(dataDir, { recursive: true, force: true });
  });

  let response;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/`, { headers: { accept: "text/html" } });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(response, "server did not start");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();

  assert.match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/support\.orderofkpi\.com\/?["']/i);
  assert.match(html, /<meta[^>]+property=["']og:type["'][^>]+content=["']website["']/i);
  assert.match(html, /<meta[^>]+property=["']og:url["'][^>]+content=["']https:\/\/support\.orderofkpi\.com["']/i);
  assert.match(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']https:\/\/support\.orderofkpi\.com\/og\.jpg\?v=20260824["']/i);
  assert.match(html, /<meta[^>]+property=["']og:image:width["'][^>]+content=["']1200["']/i);
  assert.match(html, /<meta[^>]+property=["']og:image:height["'][^>]+content=["']630["']/i);
  assert.match(html, /<meta[^>]+name=["']twitter:card["'][^>]+content=["']summary_large_image["']/i);
  assert.match(html, /© Order of KP, Inc\./);
  assert.doesNotMatch(html, /THE ORDER OF KPI/);
});
