import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
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
}

test("server-renders the Twilight wallpaper studio", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Twilight — SGI Wallpaper Generator<\/title>/i);
  assert.match(html, /<canvas/);
  assert.match(html, /TWILIGHT/);
  assert.match(html, /Open settings/);
  assert.doesNotMatch(html, /bcaluneo\/twilight|joelbraun\/twilight/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps the renderer, PNG export, and starter cleanup explicit", async () => {
  const [studio, css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/TwilightStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(studio, /function drawSky/);
  assert.match(studio, /toBlob\(resolve, "image\/png"\)/);
  assert.match(studio, /5120 × 2880/);
  assert.match(studio, /aria-controls="twilight-settings"/);
  assert.match(studio, /github\.com\/bcaluneo\/twilight/);
  assert.match(studio, /github\.com\/joelbraun\/twilight/);
  assert.match(studio, /bcaluneo\/twilight · Brendan Caluneo/);
  assert.match(studio, /joelbraun\/twilight · Joel Braun/);
  assert.doesNotMatch(studio, /className="twilight-credit"/);
  assert.match(studio, /Diamond · 5K reference/);
  assert.match(studio, /Soft twinkle/);
  assert.match(studio, /getTwinkleOpacity/);
  assert.match(studio, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.settings-toggle/);
  assert.match(css, /\.twinkle-switch/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(page, /export const metadata:\s*Metadata/);
  assert.match(page, /<TwilightStudio \/>/);
  assert.match(layout, /Twilight — SGI Wallpaper Generator/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
});
