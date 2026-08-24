import assert from "node:assert/strict";
import test from "node:test";

test("renders production social preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();

  assert.match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/support\.orderofkpi\.com\/?["']/i);
  assert.match(html, /<meta[^>]+property=["']og:type["'][^>]+content=["']website["']/i);
  assert.match(html, /<meta[^>]+property=["']og:url["'][^>]+content=["']https:\/\/support\.orderofkpi\.com["']/i);
  assert.match(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']https:\/\/support\.orderofkpi\.com\/og\.jpg\?v=20260824["']/i);
  assert.match(html, /<meta[^>]+property=["']og:image:width["'][^>]+content=["']1200["']/i);
  assert.match(html, /<meta[^>]+property=["']og:image:height["'][^>]+content=["']630["']/i);
  assert.match(html, /<meta[^>]+name=["']twitter:card["'][^>]+content=["']summary_large_image["']/i);
});
