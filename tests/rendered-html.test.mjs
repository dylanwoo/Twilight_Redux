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
  assert.match(html, />Twilight<\/button>/);
  assert.match(html, /Open settings/);
  assert.match(html, /twilight-events-canvas/);
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
  assert.match(studio, /github\.com\/dylanwoo\/Twilight_Redux/);
  assert.match(studio, /dylanwoo\/Twilight_Redux/);
  assert.match(studio, /Howard Look&apos;s SGI original/);
  assert.doesNotMatch(studio, /github\.com\/bcaluneo\/twilight/);
  assert.doesNotMatch(studio, /github\.com\/joelbraun\/twilight/);
  assert.doesNotMatch(studio, /className="twilight-credit"/);
  assert.match(studio, /Diamond · 5K reference/);
  assert.match(studio, /Soft twinkle/);
  assert.match(studio, /Show upper-left text/);
  assert.match(studio, /showMasthead/);
  assert.match(studio, /realisticMode/);
  assert.match(studio, /function drawRealisticSky/);
  assert.match(studio, /function drawRealisticStars/);
  assert.match(studio, /function drawRealisticClouds/);
  assert.match(studio, /function drawCirrusWisps/);
  assert.match(studio, /function drawHorizonClouds/);
  assert.match(studio, /function applyCirrusAlphaMask/);
  assert.match(studio, /globalCompositeOperation = "destination-out"/);
  assert.match(studio, /document\.createElement\("canvas"\)/);
  assert.doesNotMatch(studio, /drawStratifiedCloudBanks/);
  assert.match(studio, /horizon-lit cirrus/);
  assert.match(studio, /const wispCount = 4/);
  assert.match(studio, /const horizonLight = smoothStep/);
  assert.match(studio, /const twilightLine = mix/);
  assert.match(studio, /const veilPath = new Path2D/);
  assert.match(studio, /const coreX =/);
  assert.match(studio, /strokeStyle = "rgb\(4 9 20 \/ 0\.11\)"/);
  assert.match(studio, /function drawAurora/);
  assert.match(studio, /dense photographic star field/);
  assert.match(studio, /megapixels \* 5200/);
  assert.match(studio, /function drawSoftEllipse/);
  assert.match(studio, /function valueNoise1D/);
  assert.match(studio, /function fractalNoise1D/);
  assert.match(studio, /function appalachianRidgePoints/);
  assert.match(studio, /function drawAppalachianMountainLayer/);
  assert.match(studio, /Appalachian ridgelines/);
  assert.match(studio, /function drawTransientEvent/);
  assert.match(studio, /function getTransientAngle/);
  assert.match(studio, /dataset\.activeEvent/);
  assert.match(studio, /dataset\.eventAngle/);
  assert.doesNotMatch(studio, /event\.slope/);
  assert.match(studio, /TRANSIENT_MIN_INTERVAL_SECONDS = 65/);
  assert.match(studio, /TRANSIENT_MAX_INTERVAL_SECONDS = 140/);
  assert.match(studio, /kindSelector < 0\.47/);
  assert.match(studio, /kindSelector < 0\.76/);
  assert.match(studio, /satellite: 11/);
  assert.match(studio, /plane: 13/);
  assert.match(studio, /comet: 3/);
  assert.match(studio, /function getLocalTransientTestScenario/);
  assert.match(studio, /window\.location\.hostname === "localhost"/);
  assert.match(studio, /satellite: 689/);
  assert.match(studio, /plane: 408/);
  assert.match(studio, /comet: 417/);
  assert.match(studio, /"satellite" \| "plane" \| "comet"/);
  assert.match(studio, /ENHANCED_MODE_CHANCES = 8/);
  assert.match(studio, /ENHANCED_MODE_WINS = 3/);
  assert.match(studio, /draw\[0\] % ENHANCED_MODE_CHANCES < ENHANCED_MODE_WINS/);
  assert.match(studio, /const updateEnhancedMode = useCallback/);
  assert.match(studio, /if \(enabled\) setTwinkle\(true\)/);
  assert.match(studio, /Twilight \(Enhanced\)/);
  assert.match(studio, /aria-pressed=\{realisticMode\}/);
  assert.match(studio, /twilight-events-canvas/);
  assert.match(studio, /getTwinkleOpacity/);
  assert.match(studio, /horizonInfluence/);
  assert.match(studio, /DIAGONAL_CROSS_ROTATION/);
  assert.match(studio, /drawCross/);
  assert.match(studio, /bright \? 0\.2 : 0\.38/);
  assert.match(studio, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.settings-toggle/);
  assert.match(css, /\.twinkle-switch/);
  assert.match(css, /\.twilight-events-canvas/);
  assert.match(css, /\.realistic-control/);
  assert.match(css, /\.twilight-title:focus-visible/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /\.settings-panel select option/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(page, /export const metadata:\s*Metadata/);
  assert.match(page, /<TwilightStudio \/>/);
  assert.match(layout, /Twilight — SGI Wallpaper Generator/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
});
