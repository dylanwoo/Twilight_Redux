"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PALETTES = {
  authentic: {
    label: "Authentic SGI",
    top: "#000000",
    middle: "#006ebd",
    horizon: "#ff4800",
  },
  deep: {
    label: "Deep night",
    top: "#000208",
    middle: "#075888",
    horizon: "#dc4618",
  },
  soft: {
    label: "Soft dusk",
    top: "#03000b",
    middle: "#344782",
    horizon: "#ff6949",
  },
} as const;

const WALLPAPER_SIZES = [
  { id: "fhd", label: "Full HD · 1920 × 1080", width: 1920, height: 1080 },
  { id: "qhd", label: "QHD · 2560 × 1440", width: 2560, height: 1440 },
  {
    id: "ultrawide",
    label: "Ultra-wide · 3440 × 1440",
    width: 3440,
    height: 1440,
  },
  { id: "4k", label: "4K UHD · 3840 × 2160", width: 3840, height: 2160 },
  { id: "5k", label: "5K · 5120 × 2880", width: 5120, height: 2880 },
  { id: "custom", label: "Custom dimensions", width: 0, height: 0 },
] as const;

type PaletteKey = keyof typeof PALETTES;
type StarShape = "cross" | "diamond";

type SkySettings = {
  palette: (typeof PALETTES)[PaletteKey];
  transition: number;
  starDensity: number;
  brightStarDensity: number;
  starShape: StarShape;
  seed: number;
};

type Rgb = { r: number; g: number; b: number };

const DEFAULTS = {
  palette: "authentic" as PaletteKey,
  horizon: 20,
  stars: 100,
  brightStars: 100,
  starShape: "cross" as StarShape,
  seed: 1991,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * amount),
    g: Math.round(from.g + (to.g - from.g) * amount),
    b: Math.round(from.b + (to.b - from.b) * amount),
  };
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function getStarColor(
  yFromBottom: number,
  height: number,
  palette: SkySettings["palette"],
  transition: number,
) {
  if (yFromBottom > height / 2) return "rgb(255 255 255)";

  const top = hexToRgb(palette.top);
  const middle = hexToRgb(palette.middle);
  const horizon = hexToRgb(palette.horizon);
  const cutoff = height * transition;
  const sky =
    yFromBottom < cutoff
      ? mix(horizon, middle, yFromBottom / cutoff)
      : mix(
          middle,
          top,
          (yFromBottom - cutoff) / Math.max(1, height - cutoff),
        );
  const brightness = clamp(yFromBottom / (height / 2), 0, 1);
  const color = mix(sky, { r: 255, g: 255, b: 255 }, brightness);
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

function drawDiamond(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const radius = Math.max(1, Math.ceil(size * 1.5));
  for (let offset = -radius; offset <= radius; offset += 1) {
    const halfWidth = Math.max(
      0,
      Math.floor(radius * (1 - Math.abs(offset) / (radius + 0.001))),
    );
    context.fillRect(x - halfWidth, y + offset, halfWidth * 2 + 1, 1);
  }
}

function drawSky(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: SkySettings,
) {
  const transition = clamp(settings.transition, 0.08, 0.38);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, settings.palette.top);
  gradient.addColorStop(1 - transition, settings.palette.middle);
  gradient.addColorStop(1, settings.palette.horizon);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const random = mulberry32(settings.seed);
  const megapixels = (width * height) / 1_000_000;
  const starScale = clamp(
    Math.round(Math.min(width / 1280, height / 720)),
    1,
    4,
  );
  const smallStarCount = Math.max(
    180,
    Math.round(Math.min(megapixels * 1205, 5000) * settings.starDensity),
  );
  const brightStarCount = Math.max(
    settings.brightStarDensity > 0 ? 14 : 0,
    Math.round(Math.min(megapixels * 96, 560) * settings.brightStarDensity),
  );

  for (let index = 0; index < smallStarCount; index += 1) {
    const x = Math.floor(random() * width);
    const yFromBottom = random() * height;
    const y = Math.floor(height - yFromBottom);
    context.fillStyle = getStarColor(
      yFromBottom,
      height,
      settings.palette,
      transition,
    );
    context.fillRect(x, y, starScale, starScale);
  }

  for (let index = 0; index < brightStarCount; index += 1) {
    const x = Math.floor(random() * width);
    const yFromBottom = random() * height;
    const y = Math.floor(height - yFromBottom);
    const size = Math.max(1, Math.round(starScale * random()));
    context.fillStyle = getStarColor(
      yFromBottom,
      height,
      settings.palette,
      transition,
    );
    if (settings.starShape === "diamond") {
      drawDiamond(context, x, y, size);
    } else {
      const length = size * 3;
      const offset = Math.floor(length / 2);
      const thicknessOffset = Math.floor(size / 2);
      context.fillRect(x - offset, y - thicknessOffset, length, size);
      context.fillRect(x - thicknessOffset, y - offset, size, length);
    }
  }
}

export function TwilightStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteKey, setPaletteKey] = useState<PaletteKey>(DEFAULTS.palette);
  const [horizon, setHorizon] = useState(DEFAULTS.horizon);
  const [stars, setStars] = useState(DEFAULTS.stars);
  const [brightStars, setBrightStars] = useState(DEFAULTS.brightStars);
  const [starShape, setStarShape] = useState<StarShape>(DEFAULTS.starShape);
  const [seed, setSeed] = useState(DEFAULTS.seed);
  const [sizeId, setSizeId] = useState("4k");
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  const skySettings = useMemo<SkySettings>(
    () => ({
      palette: PALETTES[paletteKey],
      transition: horizon / 100,
      starDensity: stars / 100,
      brightStarDensity: brightStars / 100,
      starShape,
      seed,
    }),
    [brightStars, horizon, paletteKey, seed, starShape, stars],
  );

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * density);
    const pixelHeight = Math.round(height * density);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    drawSky(context, width, height, skySettings);
  }, [skySettings]);

  useEffect(() => {
    renderPreview();
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(renderPreview);
    });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [renderPreview]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const randomizeSeed = () => {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    setSeed(values[0]);
    setExportStatus("");
  };

  const resetSky = () => {
    setPaletteKey(DEFAULTS.palette);
    setHorizon(DEFAULTS.horizon);
    setStars(DEFAULTS.stars);
    setBrightStars(DEFAULTS.brightStars);
    setStarShape(DEFAULTS.starShape);
    setSeed(DEFAULTS.seed);
    setExportStatus("");
  };

  const downloadWallpaper = async () => {
    const preset = WALLPAPER_SIZES.find((size) => size.id === sizeId);
    const width = Math.round(sizeId === "custom" ? customWidth : preset?.width || 0);
    const height = Math.round(
      sizeId === "custom" ? customHeight : preset?.height || 0,
    );

    if (
      width < 320 ||
      height < 320 ||
      width > 6400 ||
      height > 6400 ||
      width * height > 25_000_000
    ) {
      setExportStatus(
        "Use 320–6400 px per side and keep the image below 25 megapixels.",
      );
      return;
    }

    setExporting(true);
    setExportStatus(`Rendering ${width} × ${height}…`);

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = width;
      exportCanvas.height = height;
      const context = exportCanvas.getContext("2d");
      if (!context) throw new Error("Canvas rendering is unavailable.");
      drawSky(context, width, height, skySettings);

      const blob = await new Promise<Blob | null>((resolve) => {
        exportCanvas.toBlob(resolve, "image/png");
      });
      if (!blob) throw new Error("PNG creation failed.");

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `twilight-${width}x${height}-seed-${seed}.png`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus(`Saved ${width} × ${height} PNG.`);
    } catch {
      setExportStatus("That export did not finish. Try a smaller dimension.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="twilight-app">
      <canvas ref={canvasRef} className="twilight-canvas">
        A procedural twilight sky inspired by the classic SGI IRIX wallpaper.
      </canvas>

      <header className="twilight-masthead" aria-label="Twilight wallpaper studio">
        <div className="twilight-masthead-line">
          <span className="twilight-signal" aria-hidden="true" />
          <span className="twilight-title">TWILIGHT</span>
        </div>
        <span className="twilight-kicker">IRIX sky study · deterministic field</span>
      </header>

      {settingsOpen ? (
        <aside
          className="settings-panel"
          id="twilight-settings"
          aria-labelledby="settings-title"
        >
          <div className="settings-header">
            <div>
              <p className="settings-eyebrow">Sky controls</p>
              <h2 id="settings-title">Twilight settings</h2>
            </div>
            <button
              className="close-button"
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
            >
              ×
            </button>
          </div>

          <section className="settings-section" aria-labelledby="appearance-title">
            <h3 className="settings-section-title" id="appearance-title">
              Appearance
            </h3>
            <div className="control-stack">
              <label className="control-row">
                <span className="control-label">Palette</span>
                <select
                  value={paletteKey}
                  onChange={(event) => {
                    setPaletteKey(event.target.value as PaletteKey);
                    setExportStatus("");
                  }}
                >
                  {Object.entries(PALETTES).map(([key, palette]) => (
                    <option key={key} value={key}>
                      {palette.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="control-row">
                <span className="control-label">
                  Horizon glow
                  <span className="control-value">{horizon}%</span>
                </span>
                <input
                  type="range"
                  min="10"
                  max="34"
                  value={horizon}
                  onChange={(event) => {
                    setHorizon(Number(event.target.value));
                    setExportStatus("");
                  }}
                />
              </label>

              <label className="control-row">
                <span className="control-label">
                  Star field
                  <span className="control-value">{stars}%</span>
                </span>
                <input
                  type="range"
                  min="25"
                  max="200"
                  step="5"
                  value={stars}
                  onChange={(event) => {
                    setStars(Number(event.target.value));
                    setExportStatus("");
                  }}
                />
              </label>

              <label className="control-row">
                <span className="control-label">
                  Large stars
                  <span className="control-value">{brightStars}%</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="180"
                  step="5"
                  value={brightStars}
                  onChange={(event) => {
                    setBrightStars(Number(event.target.value));
                    setExportStatus("");
                  }}
                />
              </label>

              <label className="control-row">
                <span className="control-label">Star shape</span>
                <select
                  value={starShape}
                  onChange={(event) => {
                    setStarShape(event.target.value as StarShape);
                    setExportStatus("");
                  }}
                >
                  <option value="cross">SGI cross · original</option>
                  <option value="diamond">Diamond · 5K reference</option>
                </select>
              </label>

              <label className="control-row">
                <span className="control-label">Star seed</span>
                <span className="seed-row">
                  <input
                    type="number"
                    min="0"
                    max="4294967295"
                    value={seed}
                    onChange={(event) => {
                      setSeed(clamp(Number(event.target.value) || 0, 0, 4294967295));
                      setExportStatus("");
                    }}
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={randomizeSeed}
                  >
                    Shuffle
                  </button>
                </span>
              </label>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="export-title">
            <h3 className="settings-section-title" id="export-title">
              Wallpaper output
            </h3>
            <label className="control-row">
              <span className="control-label">Dimensions</span>
              <select value={sizeId} onChange={(event) => setSizeId(event.target.value)}>
                {WALLPAPER_SIZES.map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.label}
                  </option>
                ))}
              </select>
            </label>

            {sizeId === "custom" ? (
              <div className="dimension-grid">
                <label className="control-row">
                  <span className="control-label">Width</span>
                  <input
                    type="number"
                    min="320"
                    max="6400"
                    value={customWidth}
                    onChange={(event) => setCustomWidth(Number(event.target.value))}
                  />
                </label>
                <label className="control-row">
                  <span className="control-label">Height</span>
                  <input
                    type="number"
                    min="320"
                    max="6400"
                    value={customHeight}
                    onChange={(event) => setCustomHeight(Number(event.target.value))}
                  />
                </label>
              </div>
            ) : null}

            <button
              className="download-button"
              type="button"
              disabled={exporting}
              onClick={downloadWallpaper}
            >
              {exporting ? "Rendering PNG…" : "Download PNG"}
            </button>
            <p className="export-status" aria-live="polite">
              {exportStatus || "Your download contains the sky only—no interface."}
            </p>
          </section>

          <div className="panel-actions">
            <p>
              References:{" "}
              <a href="https://github.com/bcaluneo/twilight" target="_blank" rel="noreferrer">
                Brendan Caluneo
              </a>{" "}
              and{" "}
              <a href="https://github.com/joelbraun/twilight" target="_blank" rel="noreferrer">
                Joel Braun
              </a>
              , both recreating Howard Look&apos;s SGI original.
            </p>
            <button className="reset-button" type="button" onClick={resetSky}>
              Reset
            </button>
          </div>
        </aside>
      ) : null}

      <button
        className="settings-toggle"
        type="button"
        aria-label={settingsOpen ? "Close settings" : "Open settings"}
        aria-expanded={settingsOpen}
        aria-controls="twilight-settings"
        onClick={() => setSettingsOpen((open) => !open)}
      >
        <span className="gear-glyph" aria-hidden="true">
          ⚙
        </span>
      </button>

      <p className="twilight-credit">
        References ·{" "}
        <a href="https://github.com/bcaluneo/twilight" target="_blank" rel="noreferrer">
          bcaluneo / Brendan Caluneo
        </a>{" "}
        ·{" "}
        <a href="https://github.com/joelbraun/twilight" target="_blank" rel="noreferrer">
          joelbraun / Joel Braun
        </a>
      </p>
    </main>
  );
}
