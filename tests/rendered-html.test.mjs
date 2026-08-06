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
  const [studio, css, page, layout, packageJson, readme] = await Promise.all([
    readFile(new URL("../app/TwilightStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(studio, /function drawSky/);
  assert.match(studio, /toBlob\(resolve, "image\/png"\)/);
  assert.match(studio, /5120 × 2880/);
  assert.match(studio, /aria-controls="twilight-settings"/);
  assert.match(studio, /github\.com\/dylanwoo\/Twilight_Redux/);
  assert.match(studio, /dylanwoo\/Twilight_Redux/);
  assert.match(studio, /Howard Look&apos;s SGI original/);
  assert.match(studio, /Dedicated to Patty Ludwig — avid skywatcher/);
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
  assert.match(studio, /function drawHorizonCloudRibbon/);
  assert.match(studio, /const fragmentCount = 1 \+ Math\.floor\(random\(\) \* 3\)/);
  assert.doesNotMatch(studio, /cloudWidth \* 0\.52/);
  assert.match(studio, /const baseWispCount = 4 \+ Math\.floor\(random\(\) \* 5\)/);
  assert.match(studio, /Math\.round\(baseWispCount \* cloudDensity\)/);
  assert.match(studio, /const baseCloudCount = 2 \+ Math\.floor\(random\(\) \* 4\)/);
  assert.match(studio, /Math\.round\(baseCloudCount \* cloudDensity\)/);
  assert.match(studio, /Cloud density/);
  assert.match(studio, /allowing natural/);
  assert.match(studio, /min="100"/);
  assert.match(studio, /function wrapHorizontal/);
  assert.match(studio, /cloudTimeSeconds/);
  assert.match(studio, /const driftSpeed = width/);
  assert.match(studio, /0\.00125 \+ random\(\) \* 0\.0011/);
  assert.match(studio, /0\.0009 \+ random\(\) \* 0\.0007/);
  assert.match(studio, /baseStartX \+ \(cloudTimeSeconds \?\? 0\) \* driftSpeed/);
  assert.match(studio, /function applyCirrusAlphaMask/);
  assert.match(studio, /globalCompositeOperation = "destination-out"/);
  assert.match(studio, /document\.createElement\("canvas"\)/);
  assert.doesNotMatch(studio, /drawStratifiedCloudBanks/);
  assert.match(studio, /horizon-lit cirrus/);
  assert.match(studio, /const horizonLight = smoothStep/);
  assert.match(studio, /const twilightLine = mix/);
  assert.match(studio, /const glowStrength = smoothStep/);
  assert.match(studio, /const groundLine = height \* 0\.822/);
  assert.match(studio, /const gradientLift =/);
  assert.match(studio, /const gradientScale = clamp/);
  assert.match(studio, /0\.075 \* gradientScale/);
  assert.match(studio, /0\.012 \* gradientScale/);
  assert.match(studio, /const glowY = groundLine - gradientLift \* height/);
  assert.match(studio, /vertical depth, and position while/);
  assert.match(studio, /const glowOpacity = Math\.sqrt\(glowStrength\)/);
  assert.match(studio, /glowOpacity \* 0\.23/);
  assert.match(studio, /min="0"/);
  assert.match(studio, /const veilPath = new Path2D/);
  assert.match(studio, /const coreX =/);
  assert.match(studio, /strokeStyle = "rgb\(4 9 20 \/ 0\.11\)"/);
  assert.match(studio, /function drawAurora/);
  assert.match(studio, /dense photographic star field/);
  assert.match(studio, /stars: 200/);
  assert.match(studio, /megapixels \* 5200/);
  assert.match(studio, /function drawSoftEllipse/);
  assert.match(studio, /function valueNoise1D/);
  assert.match(studio, /function fractalNoise1D/);
  assert.match(studio, /function appalachianRidgePoints/);
  assert.match(studio, /function drawAppalachianMountainLayer/);
  assert.match(studio, /mountainSoftness/);
  assert.match(studio, /Distant mountain softness/);
  assert.match(studio, /distantMountainBlur \* 0\.55/);
  assert.match(studio, /0\.0036 \* settings\.mountainSoftness/);
  assert.match(studio, /foreground silhouette crisp/);
  assert.match(studio, /Appalachian ridgelines/);
  assert.match(studio, /function drawTransientEvent/);
  assert.match(studio, /function getTransientAngle/);
  assert.match(studio, /dataset\.activeEvent/);
  assert.match(studio, /dataset\.eventAngle/);
  assert.doesNotMatch(studio, /event\.slope/);
  assert.match(studio, /TRANSIENT_MIN_INTERVAL_SECONDS = 25/);
  assert.match(studio, /TRANSIENT_MAX_INTERVAL_SECONDS = 115/);
  assert.match(studio, /kindSelector < 0\.58/);
  assert.match(studio, /kindSelector < 0\.73/);
  assert.match(studio, /\? 0\.12 \+ altitudeSelector \* 0\.18/);
  assert.match(studio, /context\.globalCompositeOperation = "source-over"/);
  assert.match(studio, /rgb\(218 226 235 \/ 0\.56\)/);
  assert.match(studio, /context\.shadowBlur = 3 \* scale/);
  assert.match(studio, /const speedMultiplier =/);
  assert.match(studio, /\? 1\.3 \+ hashUnit\(seed, eventIndex, 0x243f6a88\) \* 0\.2/);
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
  assert.match(studio, /cloudSeed/);
  assert.match(studio, /const draw = new Uint32Array\(2\)/);
  assert.match(studio, /setCloudSeed\(draw\[1\]\)/);
  assert.match(studio, /draw\[0\] % ENHANCED_MODE_CHANCES < ENHANCED_MODE_WINS/);
  assert.match(studio, /const updateEnhancedMode = useCallback/);
  assert.match(studio, /if \(enabled\) setTwinkle\(true\)/);
  assert.match(studio, /Enhanced mode/);
  assert.doesNotMatch(studio, />Realistic mode</);
  assert.match(studio, /const cloudTimeRef = useRef\(0\)/);
  assert.match(studio, /cloudTimeRef\.current = animationTimeSeconds/);
  assert.match(studio, /skySettings\.realisticMode \? cloudTimeRef\.current : null/);
  assert.match(studio, /const randomizeClouds =/);
  assert.match(studio, /Shuffle clouds/);
  assert.match(studio, /without changing the stars/);
  assert.match(studio, /\(twinkle \|\| realisticMode\) && motionAllowed/);
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
  assert.match(css, /--panel: rgb\(3 9 15 \/ 0\.64\)/);
  assert.match(css, /backdrop-filter: blur\(10px\) saturate\(1\.1\)/);
  assert.match(css, /\.panel-dedication/);
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
  assert.match(readme, /Twilight \(Enhanced\)/);
  assert.match(readme, /Patty Ludwig/);
  assert.match(readme, /enhanced-random-01\.jpg/);
  assert.match(readme, /enhanced-random-02\.jpg/);
  assert.match(readme, /enhanced-random-03\.jpg/);

  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
  await Promise.all([
    access(new URL("../docs/screenshots/enhanced-random-01.jpg", import.meta.url)),
    access(new URL("../docs/screenshots/enhanced-random-02.jpg", import.meta.url)),
    access(new URL("../docs/screenshots/enhanced-random-03.jpg", import.meta.url)),
  ]);
});
