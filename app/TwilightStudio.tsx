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
  cloudSeed: number;
  cloudDensity: number;
  mountainSoftness: number;
  realisticMode: boolean;
};

type Rgb = { r: number; g: number; b: number };
type CanvasPoint = { x: number; y: number };
type CubicCurve = readonly [CanvasPoint, CanvasPoint, CanvasPoint, CanvasPoint];
type TransientKind = "satellite" | "plane" | "comet";

type TransientEvent = {
  kind: TransientKind;
  progress: number;
  direction: 1 | -1;
  altitude: number;
  angle: number;
  variant: number;
};

const TWINKLE_FRAME_INTERVAL = 1000 / 30;
const DIAGONAL_CROSS_ROTATION = Math.PI / 4;
const TRANSIENT_MIN_INTERVAL_SECONDS = 25;
const TRANSIENT_MAX_INTERVAL_SECONDS = 115;
const ENHANCED_MODE_CHANCES = 8;
const ENHANCED_MODE_WINS = 3;
const TRANSIENT_DURATIONS: Record<TransientKind, number> = {
  satellite: 11,
  plane: 13,
  comet: 3,
};

const DEFAULTS = {
  palette: "authentic" as PaletteKey,
  horizon: 20,
  stars: 200,
  brightStars: 100,
  starShape: "cross" as StarShape,
  seed: 1991,
  cloudDensity: 100,
  mountainSoftness: 60,
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

function rgb(color: Rgb, alpha = 1) {
  return `rgb(${color.r} ${color.g} ${color.b} / ${alpha})`;
}

function smoothStep(value: number) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function wrapHorizontal(position: number, minimum: number, maximum: number) {
  const span = maximum - minimum;
  return ((((position - minimum) % span) + span) % span) + minimum;
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

function hashUnit(seed: number, index: number, salt: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function getTwinkleOpacity(
  seed: number,
  index: number,
  timeSeconds: number | null,
  bright: boolean,
  horizonInfluence: number,
) {
  if (timeSeconds === null) return 1;

  const salt = bright ? 0x6d2b79f5 : 0x1b873593;
  const selector = hashUnit(seed, index, salt);
  const twinkleShare = bright ? 0.96 : 0.38 + horizonInfluence * 0.22;
  if (selector > twinkleShare) return 1;

  // Atmospheric scintillation is irregular rather than a uniform pulse. Two
  // deterministic waves keep the sky calm without synchronized stars.
  const phase = hashUnit(seed, index, salt ^ 0x85ebca6b) * Math.PI * 2;
  const secondaryPhase = hashUnit(seed, index, salt ^ 0xc2b2ae35) * Math.PI * 2;
  const cyclesPerSecond =
    0.42 + hashUnit(seed, index, salt ^ 0x27d4eb2f) * 1.18;
  const primary = Math.sin(timeSeconds * cyclesPerSecond * Math.PI * 2 + phase);
  const secondary = Math.sin(
    timeSeconds * cyclesPerSecond * 1.73 * Math.PI * 2 + secondaryPhase,
  );
  const shimmer = primary * 0.62 + secondary * 0.38;
  const normalizedShimmer = Math.pow((shimmer + 1) / 2, 1.35);
  const atmosphericDepth = (bright ? 0.78 : 0.5) *
    (0.62 + horizonInfluence * 0.38);
  return clamp(
    1 - atmosphericDepth + normalizedShimmer * atmosphericDepth,
    bright ? 0.2 : 0.38,
    1,
  );
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

function drawCross(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
) {
  const length = size * 3;
  const offset = Math.floor(length / 2);
  const thicknessOffset = Math.floor(size / 2);

  if (rotation === 0) {
    context.fillRect(x - offset, y - thicknessOffset, length, size);
    context.fillRect(x - thicknessOffset, y - offset, size, length);
    return;
  }

  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.fillRect(-offset, -thicknessOffset, length, size);
  context.fillRect(-thicknessOffset, -offset, size, length);
  context.restore();
}

function drawClassicSky(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: SkySettings,
  twinkleTimeSeconds: number | null = null,
) {
  const transition = clamp(settings.transition, 0, 0.38);
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
    context.globalAlpha = getTwinkleOpacity(
      settings.seed,
      index,
      twinkleTimeSeconds,
      false,
      1 - yFromBottom / height,
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
    context.globalAlpha = getTwinkleOpacity(
      settings.seed,
      index,
      twinkleTimeSeconds,
      true,
      1 - yFromBottom / height,
    );
    if (settings.starShape === "diamond") {
      drawDiamond(context, x, y, size);
    } else {
      const rotationSelector = hashUnit(settings.seed, index, 0x94d049bb);
      const rotation = rotationSelector > 0.68 ? DIAGONAL_CROSS_ROTATION : 0;
      drawCross(context, x, y, size, rotation);
    }
  }
  context.globalAlpha = 1;
}

function drawMilkyWay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  starDensity: number,
) {
  const direction = hashUnit(seed, 0, 0x3c6ef372) > 0.5 ? 1 : -1;
  const bandWidth = Math.max(80, Math.min(width, height) * 0.24);
  const random = mulberry32(seed ^ 0xbb67ae85);
  const megapixels = (width * height) / 1_000_000;
  const dustStarCount = Math.round(
    Math.min(Math.max(1600, megapixels * 1200), 9000) * starDensity,
  );
  const scale = clamp(Math.min(width / 1440, height / 900), 0.72, 3.4);
  const tilt = -0.54 + (hashUnit(seed, 0, 0x71374491) - 0.5) * 0.12;
  const coreX = (hashUnit(seed, 0, 0xb5c0fbcf) - 0.5) * width * 0.72;

  context.save();
  context.globalCompositeOperation = "screen";
  context.translate(width * 0.52, height * 0.3);
  context.rotate(direction * tilt);
  const dust = context.createLinearGradient(0, -bandWidth, 0, bandWidth);
  dust.addColorStop(0, "rgb(106 134 178 / 0)");
  dust.addColorStop(0.24, "rgb(92 129 178 / 0.05)");
  dust.addColorStop(0.4, "rgb(123 157 199 / 0.13)");
  dust.addColorStop(0.49, "rgb(190 171 222 / 0.22)");
  dust.addColorStop(0.56, "rgb(151 128 191 / 0.16)");
  dust.addColorStop(0.72, "rgb(76 112 163 / 0.06)");
  dust.addColorStop(1, "rgb(91 119 164 / 0)");
  context.fillStyle = dust;
  context.fillRect(-width * 1.1, -bandWidth, width * 2.2, bandWidth * 2);

  context.filter = `blur(${Math.max(2, Math.min(width, height) * 0.006)}px)`;
  drawSoftEllipse(
    context,
    coreX,
    bandWidth * 0.02,
    width * 0.18,
    bandWidth * 0.42,
    "rgb(205 178 224 / 0.13)",
    "rgb(105 143 190 / 0.052)",
  );
  for (let cloud = 0; cloud < 20; cloud += 1) {
    const dustX = (random() - 0.5) * width * 1.9;
    const dustY = (random() - 0.5) * bandWidth * 0.94;
    const warm = random() > 0.68;
    const coreInfluence = Math.exp(
      -Math.pow((dustX - coreX) / (width * 0.3), 2),
    );
    drawSoftEllipse(
      context,
      dustX,
      dustY,
      width * (0.026 + random() * 0.072),
      bandWidth * (0.08 + random() * 0.18),
      warm
        ? `rgb(180 135 193 / ${0.06 + coreInfluence * 0.05})`
        : `rgb(126 166 207 / ${0.068 + coreInfluence * 0.042})`,
      `rgb(73 103 151 / ${0.024 + coreInfluence * 0.018})`,
    );
  }

  context.save();
  context.globalCompositeOperation = "source-over";
  context.filter = `blur(${Math.max(3, bandWidth * 0.045)}px)`;
  context.strokeStyle = "rgb(4 9 20 / 0.11)";
  context.lineWidth = bandWidth * 0.075;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(-width * 1.05, bandWidth * 0.03);
  context.bezierCurveTo(
    -width * 0.42,
    -bandWidth * 0.09,
    width * 0.36,
    bandWidth * 0.12,
    width * 1.05,
    -bandWidth * 0.025,
  );
  context.stroke();
  context.restore();

  context.filter = "none";
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < dustStarCount; index += 1) {
    const x = (random() - 0.5) * width * 2.1;
    const centered = random() + random() + random() + random() - 2;
    const y = centered * bandWidth * 0.42;
    const dustLane = Math.abs(y + Math.sin(x / width * 18) * bandWidth * 0.06);
    if (dustLane < bandWidth * 0.055 && random() < 0.72) continue;
    const temperature = random();
    context.fillStyle =
      temperature < 0.2
        ? "rgb(174 211 255)"
        : temperature > 0.9
          ? "rgb(255 218 190)"
          : "rgb(235 243 255)";
    const coreInfluence = Math.exp(
      -Math.pow((x - coreX) / (width * 0.26), 2),
    );
    context.globalAlpha = clamp(
      0.27 + Math.pow(random(), 2.2) * 0.64 + coreInfluence * 0.16,
      0,
      0.96,
    );
    const pointSize = (0.48 + random() * 0.5) * scale;
    context.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize);
  }
  context.restore();
}

function drawRealisticStars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  groundLine: number,
  settings: SkySettings,
  twinkleTimeSeconds: number | null,
) {
  const random = mulberry32(settings.seed ^ 0x8f1bbcdc);
  const megapixels = (width * height) / 1_000_000;
  const scale = clamp(Math.min(width / 1440, height / 900), 0.72, 3.4);
  const starCount = Math.round(
    Math.min(Math.max(3000, megapixels * 5200), 26_000) *
      settings.starDensity,
  );
  const brightCount = Math.round(
    Math.min(Math.max(12, megapixels * 36), 220) *
      settings.brightStarDensity,
  );

  const pickTemperature = (selector: number) => {
    if (selector < 0.16) return { r: 178, g: 208, b: 255 };
    if (selector > 0.86) return { r: 255, g: 218, b: 174 };
    return { r: 244, g: 248, b: 255 };
  };

  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < starCount; index += 1) {
    const x = random() * width;
    const y = random() * groundLine;
    const altitude = 1 - y / groundLine;
    const extinction = 0.28 + smoothStep(altitude * 1.35) * 0.72;
    const luminosity = 0.42 + Math.pow(random(), 3.4) * 0.58;
    const radius = (0.34 + Math.pow(random(), 6) * 0.92) * scale;
    const color = pickTemperature(random());
    const twinkleOpacity = getTwinkleOpacity(
      settings.seed ^ 0x8f1bbcdc,
      index,
      twinkleTimeSeconds,
      false,
      1 - altitude,
    );

    context.globalAlpha = extinction * luminosity * twinkleOpacity;
    context.fillStyle = rgb(color);
    if (radius < 0.58 * scale) {
      const pointSize = Math.max(0.52 * scale, radius * 1.3);
      context.fillRect(
        x - pointSize / 2,
        y - pointSize / 2,
        pointSize,
        pointSize,
      );
    } else {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  for (let index = 0; index < brightCount; index += 1) {
    const x = random() * width;
    const y = random() * groundLine * 0.92;
    const altitude = 1 - y / groundLine;
    const extinction = 0.28 + smoothStep(altitude * 1.25) * 0.72;
    const coreRadius = (0.5 + random() * 0.62) * scale;
    const haloRadius = coreRadius * (2.8 + random() * 2.8);
    const color = pickTemperature(random());
    const twinkleOpacity = getTwinkleOpacity(
      settings.seed ^ 0xa54ff53a,
      index,
      twinkleTimeSeconds,
      true,
      1 - altitude,
    );
    const halo = context.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      haloRadius,
    );
    halo.addColorStop(0, rgb(color, 0.96));
    halo.addColorStop(0.18, rgb(color, 0.58));
    halo.addColorStop(0.52, rgb(color, 0.1));
    halo.addColorStop(1, rgb(color, 0));
    context.globalAlpha = extinction * twinkleOpacity;
    context.fillStyle = halo;
    context.beginPath();
    context.arc(x, y, haloRadius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawSoftEllipse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  innerColor: string,
  middleColor: string,
) {
  context.save();
  context.translate(x, y);
  context.scale(radiusX, radiusY);
  const gradient = context.createRadialGradient(-0.16, -0.24, 0.04, 0, 0, 1);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.58, middleColor);
  gradient.addColorStop(1, "rgb(0 0 0 / 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, 1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function cubicBezierPoint(curve: CubicCurve, progress: number) {
  const [start, controlOne, controlTwo, end] = curve;
  const inverse = 1 - progress;
  const inverseSquared = inverse * inverse;
  const progressSquared = progress * progress;
  return {
    x:
      inverseSquared * inverse * start.x +
      3 * inverseSquared * progress * controlOne.x +
      3 * inverse * progressSquared * controlTwo.x +
      progressSquared * progress * end.x,
    y:
      inverseSquared * inverse * start.y +
      3 * inverseSquared * progress * controlOne.y +
      3 * inverse * progressSquared * controlTwo.y +
      progressSquared * progress * end.y,
  };
}

function applyCirrusAlphaMask(
  context: CanvasRenderingContext2D,
  curve: CubicCurve,
  length: number,
  height: number,
  seed: number,
  horizonLight: number,
) {
  const random = mulberry32(seed ^ 0x3c6ef372);
  const gapCount = 9 + Math.floor(random() * 7);

  context.save();
  context.globalCompositeOperation = "destination-out";
  context.globalAlpha = 1;
  for (let gap = 0; gap < gapCount; gap += 1) {
    const progress = 0.07 + random() * 0.86;
    const point = cubicBezierPoint(curve, progress);
    const opacity =
      0.38 + random() * 0.45 + (1 - horizonLight) * 0.03;
    context.filter = `blur(${Math.max(1.5, height * (0.003 + random() * 0.004))}px)`;
    drawSoftEllipse(
      context,
      point.x + (random() - 0.5) * length * 0.025,
      point.y + (random() - 0.5) * height * 0.015,
      length * (0.024 + random() * 0.065),
      height * (0.01 + random() * 0.022),
      `rgb(0 0 0 / ${opacity})`,
      `rgb(0 0 0 / ${opacity * 0.48})`,
    );
  }
  context.restore();
}

function drawCirrusWisps(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  groundLine: number,
  seed: number,
  cloudDensity: number,
  cloudTimeSeconds: number | null,
) {
  const random = mulberry32(seed ^ 0x510e527f);
  const baseWispCount = 4 + Math.floor(random() * 5);
  const wispCount = Math.max(4, Math.round(baseWispCount * cloudDensity));
  const cloudCanvas = document.createElement("canvas");
  cloudCanvas.width = Math.max(1, Math.round(width));
  cloudCanvas.height = Math.max(1, Math.round(height));
  const cloudContext = cloudCanvas.getContext("2d");
  if (!cloudContext) return;

  cloudContext.save();
  cloudContext.globalCompositeOperation = "source-over";
  cloudContext.lineCap = "round";
  for (let wisp = 0; wisp < wispCount; wisp += 1) {
    const baseStartX = (random() * 0.6 - 0.22) * width;
    const horizonBias = Math.pow(random(), 0.56);
    const startY = (0.17 + horizonBias * 0.61) * groundLine;
    const horizonWeight = startY / groundLine;
    const horizonLight = smoothStep((horizonWeight - 0.42) / 0.38);
    const length = width * (0.46 + random() * 0.58);
    const driftSpeed = width * (0.00125 + random() * 0.0011);
    const startX = wrapHorizontal(
      baseStartX + (cloudTimeSeconds ?? 0) * driftSpeed,
      -length,
      width,
    );
    const endX = startX + length;
    const rise = (random() - 0.5) * height * (0.075 + horizonLight * 0.025);
    const curl = (random() - 0.5) * height * 0.065;
    const alpha = 0.034 + random() * 0.042 + horizonLight * 0.082;
    const illuminated = mix(
      { r: 165, g: 188, b: 216 },
      { r: 255, g: 190, b: 154 },
      horizonLight * 0.58,
    );
    const silver = mix(
      { r: 121, g: 151, b: 186 },
      { r: 213, g: 133, b: 118 },
      horizonLight * 0.48,
    );
    const curve: CubicCurve = [
      { x: startX, y: startY },
      { x: startX + length * 0.28, y: startY - curl },
      { x: startX + length * 0.66, y: startY + rise + curl },
      { x: endX, y: startY + rise },
    ];
    const color = cloudContext.createLinearGradient(
      startX,
      startY,
      endX,
      startY + rise,
    );
    color.addColorStop(0, rgb(silver, 0));
    color.addColorStop(0.16, rgb(silver, alpha * 0.38));
    color.addColorStop(0.48, rgb(illuminated, alpha));
    color.addColorStop(0.78, rgb(silver, alpha * 0.52));
    color.addColorStop(1, rgb(silver, 0));

    const veilPath = new Path2D();
    veilPath.moveTo(curve[0].x, curve[0].y);
    veilPath.bezierCurveTo(
      curve[1].x,
      curve[1].y,
      curve[2].x,
      curve[2].y,
      curve[3].x,
      curve[3].y,
    );
    cloudContext.globalAlpha = 0.7 + horizonLight * 0.18;
    cloudContext.filter = `blur(${Math.max(4, Math.min(width, height) * (0.01 + random() * 0.008))}px)`;
    cloudContext.strokeStyle = color;
    cloudContext.lineWidth =
      height * (0.016 + random() * 0.018) * (1 + horizonLight * 0.3);
    cloudContext.stroke(veilPath);

    const strandCount = 2 + Math.floor(random() * 3);
    for (let strand = 0; strand < strandCount; strand += 1) {
      const offset =
        (strand - (strandCount - 1) / 2) * height * 0.0045 +
        (random() - 0.5) * height * 0.006;
      const startJitter = (random() - 0.5) * length * 0.035;
      const endTrim = random() * length * 0.055;
      const strandCurl = curl + (random() - 0.5) * height * 0.022;
      const strandRise = rise + (random() - 0.5) * height * 0.018;
      const path = new Path2D();
      path.moveTo(startX + startJitter, startY + offset);
      path.bezierCurveTo(
        startX + length * 0.28 + startJitter * 0.35,
        startY + offset - strandCurl,
        startX + length * 0.66 - endTrim * 0.35,
        startY + offset + strandRise + strandCurl,
        endX - endTrim,
        startY + offset + strandRise,
      );

      cloudContext.globalAlpha = 0.72 + horizonLight * 0.18;
      cloudContext.filter = `blur(${Math.max(2, Math.min(width, height) * (0.004 + random() * 0.0035))}px)`;
      cloudContext.strokeStyle = color;
      cloudContext.lineWidth =
        height * (0.0025 + random() * 0.004) * (1 + horizonLight * 0.3);
      cloudContext.stroke(path);

      if (strand === 0 || random() > 0.62) {
        cloudContext.globalAlpha = 0.2 + horizonLight * 0.18;
        cloudContext.filter = `blur(${Math.max(0.7, Math.min(width, height) * 0.0015)}px)`;
        cloudContext.lineWidth = height * (0.0007 + horizonLight * 0.0008);
        cloudContext.stroke(path);
      }
    }

    // A soft destination-out mask creates gaps without turning the cirrus
    // into hard dashes, and stays deterministic for every seed and export size.
    applyCirrusAlphaMask(
      cloudContext,
      curve,
      length,
      height,
      seed ^ Math.imul(wisp + 1, 0x9e3779b1),
      horizonLight,
    );
  }
  cloudContext.restore();

  context.save();
  context.globalCompositeOperation = "screen";
  context.drawImage(cloudCanvas, 0, 0, width, height);
  context.restore();
}

function drawHorizonCloudRibbon(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  cloudWidth: number,
  cloudHeight: number,
  random: () => number,
  opacity: number,
) {
  const left = centerX - cloudWidth * 0.5;
  const right = centerX + cloudWidth * 0.5;
  const path = new Path2D();
  path.moveTo(left, centerY + cloudHeight * 0.08);
  path.bezierCurveTo(
    left + cloudWidth * 0.08,
    centerY - cloudHeight * (0.08 + random() * 0.2),
    left + cloudWidth * 0.17,
    centerY - cloudHeight * (0.42 + random() * 0.35),
    left + cloudWidth * 0.31,
    centerY - cloudHeight * (0.18 + random() * 0.3),
  );
  path.bezierCurveTo(
    left + cloudWidth * 0.43,
    centerY - cloudHeight * (0.55 + random() * 0.34),
    left + cloudWidth * 0.57,
    centerY - cloudHeight * (0.24 + random() * 0.25),
    left + cloudWidth * 0.69,
    centerY - cloudHeight * (0.38 + random() * 0.3),
  );
  path.bezierCurveTo(
    left + cloudWidth * 0.82,
    centerY - cloudHeight * (0.15 + random() * 0.25),
    right - cloudWidth * 0.07,
    centerY - cloudHeight * (0.08 + random() * 0.16),
    right,
    centerY + cloudHeight * 0.04,
  );
  path.bezierCurveTo(
    right - cloudWidth * 0.18,
    centerY + cloudHeight * (0.22 + random() * 0.14),
    left + cloudWidth * 0.28,
    centerY + cloudHeight * (0.26 + random() * 0.18),
    left,
    centerY + cloudHeight * 0.08,
  );
  path.closePath();

  const color = context.createLinearGradient(left, centerY, right, centerY);
  color.addColorStop(0, "rgb(8 15 27 / 0)");
  color.addColorStop(0.12, `rgb(12 20 33 / ${opacity * 0.42})`);
  color.addColorStop(0.34, `rgb(7 14 25 / ${opacity + 0.06})`);
  color.addColorStop(0.64, `rgb(20 28 43 / ${opacity * 0.86})`);
  color.addColorStop(0.88, `rgb(29 32 47 / ${opacity * 0.34})`);
  color.addColorStop(1, "rgb(18 25 39 / 0)");
  context.fillStyle = color;
  context.fill(path);
}

function drawHorizonClouds(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  groundLine: number,
  seed: number,
  cloudDensity: number,
  cloudTimeSeconds: number | null,
) {
  const random = mulberry32(seed ^ 0x1f83d9ab);
  const baseCloudCount = 2 + Math.floor(random() * 4);
  const cloudCount = Math.max(2, Math.round(baseCloudCount * cloudDensity));

  context.save();
  context.globalCompositeOperation = "source-over";
  context.filter = `blur(${Math.max(1.5, Math.min(width, height) * 0.004)}px)`;
  for (let cloud = 0; cloud < cloudCount; cloud += 1) {
    const baseCenterX = (random() * 1.12 - 0.06) * width;
    const centerY = (0.83 + random() * 0.095) * groundLine;
    const cloudWidth = (0.11 + random() * 0.16) * width;
    const driftSpeed = width * (0.0009 + random() * 0.0007);
    const centerX = wrapHorizontal(
      baseCenterX + (cloudTimeSeconds ?? 0) * driftSpeed,
      -cloudWidth,
      width + cloudWidth,
    );
    const cloudHeight = (0.007 + random() * 0.009) * height;
    const opacity = 0.2 + random() * 0.1;

    drawHorizonCloudRibbon(
      context,
      centerX,
      centerY,
      cloudWidth,
      cloudHeight * 2.15,
      random,
      opacity,
    );

    const fragmentCount = 1 + Math.floor(random() * 3);
    for (let fragment = 0; fragment < fragmentCount; fragment += 1) {
      drawHorizonCloudRibbon(
        context,
        centerX + (random() - 0.5) * cloudWidth * 0.72,
        centerY + (random() - 0.5) * cloudHeight * 1.55,
        cloudWidth * (0.2 + random() * 0.32),
        cloudHeight * (0.48 + random() * 0.55),
        random,
        opacity * (0.38 + random() * 0.3),
      );
    }
  }
  context.restore();
}

function drawRealisticClouds(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  groundLine: number,
  seed: number,
  cloudDensity: number,
  cloudTimeSeconds: number | null,
) {
  drawCirrusWisps(
    context,
    width,
    height,
    groundLine,
    seed,
    cloudDensity,
    cloudTimeSeconds,
  );
  drawHorizonClouds(
    context,
    width,
    height,
    groundLine,
    seed,
    cloudDensity,
    cloudTimeSeconds,
  );
}

function drawAurora(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  groundLine: number,
  seed: number,
) {
  const random = mulberry32(seed ^ 0x6a09e667);
  const centerX = (0.25 + random() * 0.5) * width;
  const strength = 0.025 + random() * 0.028;

  context.save();
  context.globalCompositeOperation = "screen";
  context.filter = `blur(${Math.max(5, Math.min(width, height) * 0.014)}px)`;

  const horizonGlow = context.createRadialGradient(
    centerX,
    groundLine * 0.78,
    0,
    centerX,
    groundLine * 0.76,
    width * 0.48,
  );
  horizonGlow.addColorStop(0, `rgb(75 201 159 / ${strength})`);
  horizonGlow.addColorStop(0.42, `rgb(52 143 149 / ${strength * 0.54})`);
  horizonGlow.addColorStop(0.76, `rgb(84 78 158 / ${strength * 0.22})`);
  horizonGlow.addColorStop(1, "rgb(29 68 112 / 0)");
  context.fillStyle = horizonGlow;
  context.fillRect(0, groundLine * 0.28, width, groundLine * 0.64);

  const curtainCount = 4 + Math.floor(random() * 3);
  for (let curtain = 0; curtain < curtainCount; curtain += 1) {
    const x = centerX + (random() - 0.5) * width * 0.58;
    const topY = groundLine * (0.12 + random() * 0.15);
    const bottomY = groundLine * (0.68 + random() * 0.12);
    const gradient = context.createLinearGradient(0, topY, 0, bottomY);
    gradient.addColorStop(0, "rgb(89 115 207 / 0)");
    gradient.addColorStop(0.28, `rgb(89 115 207 / ${strength * 0.32})`);
    gradient.addColorStop(0.68, `rgb(80 221 163 / ${strength * 0.82})`);
    gradient.addColorStop(1, "rgb(80 221 163 / 0)");
    context.strokeStyle = gradient;
    context.lineWidth = width * (0.025 + random() * 0.045);
    context.beginPath();
    context.moveTo(x, topY);
    context.bezierCurveTo(
      x + (random() - 0.5) * width * 0.07,
      topY + (bottomY - topY) * 0.32,
      x + (random() - 0.5) * width * 0.1,
      topY + (bottomY - topY) * 0.7,
      x + (random() - 0.5) * width * 0.12,
      bottomY,
    );
    context.stroke();
  }
  context.restore();
}

function valueNoise1D(position: number, seed: number) {
  const left = Math.floor(position);
  const fraction = position - left;
  const from = hashUnit(seed, left, 0x243f6a88) * 2 - 1;
  const to = hashUnit(seed, left + 1, 0x243f6a88) * 2 - 1;
  return from + (to - from) * smoothStep(fraction);
}

function fractalNoise1D(
  position: number,
  seed: number,
  octaves: number,
) {
  let frequency = 1;
  let amplitude = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise1D(position * frequency, seed + octave * 1013) * amplitude;
    weight += amplitude;
    frequency *= 2;
    amplitude *= 0.52;
  }
  return total / weight;
}

function appalachianRidgePoints(
  width: number,
  baseline: number,
  amplitude: number,
  seed: number,
  canopyDetail: number,
) {
  const points: Array<{ x: number; y: number }> = [];
  const step = Math.max(2, width / 760);
  const phase = hashUnit(seed, 0, 0x13198a2e) * 5;
  for (let x = -step; x <= width + step; x += step) {
    const normalizedX = x / Math.max(width, 1);
    const broad = fractalNoise1D(normalizedX * 2.15 + phase, seed, 5);
    const shoulders = fractalNoise1D(
      normalizedX * 5.4 + phase * 0.43,
      seed ^ 0xa4093822,
      4,
    );
    const treeLine = fractalNoise1D(
      normalizedX * (62 + canopyDetail * 70) + phase,
      seed ^ 0x299f31d0,
      2,
    );
    const ridgeHeight =
      amplitude *
      clamp(
        0.54 + broad * 0.29 + shoulders * 0.12 + treeLine * canopyDetail * 0.045,
        0.2,
        0.92,
      );
    points.push({ x, y: baseline - ridgeHeight });
  }
  return points;
}

function drawAppalachianMountainLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseline: number,
  amplitude: number,
  seed: number,
  color: string,
  ridgeColor: string,
  canopyDetail: number,
  blurRadius: number,
) {
  const points = appalachianRidgePoints(
    width,
    baseline,
    amplitude,
    seed,
    canopyDetail,
  );
  const ridge = new Path2D();
  ridge.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    ridge.lineTo(current.x, current.y);
  }
  const silhouette = new Path2D(ridge);
  silhouette.lineTo(width + 4, height);
  silhouette.lineTo(-4, height);
  silhouette.closePath();

  context.save();
  context.filter = blurRadius > 0 ? `blur(${blurRadius}px)` : "none";
  context.fillStyle = color;
  context.fill(silhouette);
  context.strokeStyle = ridgeColor;
  context.lineWidth = Math.max(0.7, height / 1100);
  context.stroke(ridge);
  context.restore();
}

function drawValleyHaze(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerY: number,
  seed: number,
  opacity: number,
) {
  const random = mulberry32(seed ^ 0x082efa98);
  const bankCount = 3 + Math.floor(random() * 3);
  for (let bank = 0; bank < bankCount; bank += 1) {
    const centerX = (random() * 1.14 - 0.07) * width;
    drawSoftEllipse(
      context,
      centerX,
      centerY + (random() - 0.5) * height * 0.018,
      width * (0.16 + random() * 0.18),
      height * (0.015 + random() * 0.018),
      `rgb(132 160 183 / ${opacity})`,
      `rgb(76 104 132 / ${opacity * 0.48})`,
    );
  }
}

function drawRealisticSky(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: SkySettings,
  twinkleTimeSeconds: number | null,
  cloudTimeSeconds: number | null,
) {
  const transition = clamp(settings.transition, 0, 0.38);
  const glowStrength = smoothStep((transition - 0.1) / 0.24);
  const top = hexToRgb(settings.palette.top);
  const middle = hexToRgb(settings.palette.middle);
  const horizon = hexToRgb(settings.palette.horizon);
  const space = mix(top, { r: 1, g: 7, b: 20 }, 0.82);
  const zenith = mix(middle, { r: 7, g: 22, b: 55 }, 0.7);
  const lowerSky = mix(middle, { r: 20, g: 58, b: 102 }, 0.48);
  const duskBlue = mix(lowerSky, { r: 73, g: 91, b: 124 }, 0.48);
  const twilightLine = mix(
    horizon,
    { r: 248, g: 177, b: 116 },
    0.62 + glowStrength * 0.18,
  );
  const horizonFade = mix(twilightLine, { r: 35, g: 35, b: 49 }, 0.7);
  const groundLine = height * 0.822;
  const horizonPosition = groundLine / height;
  const gradientLift =
    (transition - DEFAULTS.horizon / 100) * 0.42;
  const gradientScale = clamp(
    1 + (transition - DEFAULTS.horizon / 100) * 2.1,
    0.78,
    1.3,
  );
  const glowY = groundLine - gradientLift * height;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, rgb(space));
  gradient.addColorStop(0.42, rgb(zenith));
  gradient.addColorStop(
    clamp(
      0.67 - gradientLift * 0.35 - (gradientScale - 1) * 0.05,
      0.6,
      0.72,
    ),
    rgb(lowerSky),
  );
  gradient.addColorStop(
    clamp(
      horizonPosition - 0.075 * gradientScale - gradientLift,
      0.62,
      0.86,
    ),
    rgb(duskBlue),
  );
  gradient.addColorStop(
    clamp(
      horizonPosition - 0.014 * gradientScale - gradientLift,
      0.68,
      0.91,
    ),
    rgb(twilightLine),
  );
  gradient.addColorStop(
    clamp(
      horizonPosition + 0.012 * gradientScale - gradientLift,
      0.71,
      0.94,
    ),
    rgb(horizonFade),
  );
  gradient.addColorStop(1, "rgb(3 5 8)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glowCenter =
    (0.2 + hashUnit(settings.seed, 0, 0x1f83d9ab) * 0.6) * width;
  const glow = context.createRadialGradient(
    glowCenter,
    glowY,
    0,
    glowCenter,
    glowY,
    width * 0.62,
  );
  const glowOpacity = Math.sqrt(glowStrength);
  glow.addColorStop(0, rgb(twilightLine, glowOpacity * 0.23));
  glow.addColorStop(0.34, rgb(duskBlue, glowOpacity * 0.1));
  glow.addColorStop(1, rgb(space, 0));
  context.fillStyle = glow;
  context.fillRect(0, 0, width, groundLine + height * 0.1);

  drawAurora(context, width, height, groundLine, settings.seed);
  drawMilkyWay(
    context,
    width,
    height,
    settings.seed,
    settings.starDensity,
  );
  drawRealisticStars(
    context,
    width,
    height,
    groundLine,
    settings,
    twinkleTimeSeconds,
  );
  drawRealisticClouds(
    context,
    width,
    height,
    groundLine,
    settings.cloudSeed,
    settings.cloudDensity,
    cloudTimeSeconds,
  );

  const distantMountainBlur =
    Math.min(width, height) * 0.0036 * settings.mountainSoftness;

  drawAppalachianMountainLayer(
    context,
    width,
    height,
    groundLine + height * 0.025,
    height * 0.09,
    settings.seed ^ 0x9b05688c,
    "rgb(64 82 99 / 0.76)",
    "rgb(185 203 216 / 0.2)",
    0.02,
    distantMountainBlur,
  );
  drawValleyHaze(
    context,
    width,
    height,
    groundLine + height * 0.013,
    settings.seed ^ 0x452821e6,
    0.14,
  );
  drawAppalachianMountainLayer(
    context,
    width,
    height,
    groundLine + height * 0.068,
    height * 0.13,
    settings.seed ^ 0x5be0cd19,
    "rgb(28 45 55 / 0.94)",
    "rgb(132 158 171 / 0.16)",
    0.07,
    distantMountainBlur * 0.55,
  );
  drawValleyHaze(
    context,
    width,
    height,
    groundLine + height * 0.062,
    settings.seed ^ 0xbe5466cf,
    0.09,
  );
  drawAppalachianMountainLayer(
    context,
    width,
    height,
    groundLine + height * 0.115,
    height * 0.155,
    settings.seed ^ 0xc0ac29b7,
    "rgb(12 26 30 / 0.98)",
    "rgb(87 116 122 / 0.14)",
    0.12,
    0,
  );
  drawAppalachianMountainLayer(
    context,
    width,
    height,
    groundLine + height * 0.175,
    height * 0.19,
    settings.seed ^ 0xcbbb9d5d,
    "rgb(2 10 10)",
    "rgb(55 80 76 / 0.15)",
    0.2,
    0,
  );
  context.globalAlpha = 1;
}

function getTransientAngle(
  kind: TransientKind,
  seed: number,
  eventIndex: number,
) {
  const ranges: Record<TransientKind, { minimum: number; maximum: number }> = {
    satellite: { minimum: 2, maximum: 10 },
    plane: { minimum: 1.5, maximum: 8 },
    comet: { minimum: 7, maximum: 16 },
  };
  const range = ranges[kind];
  const magnitude =
    range.minimum +
    hashUnit(seed, eventIndex, 0x59f111f1) *
      (range.maximum - range.minimum);
  const direction = hashUnit(seed, eventIndex, 0x106aa070) > 0.5 ? 1 : -1;
  return (magnitude * direction * Math.PI) / 180;
}

function getTransientEvent(seed: number, timeSeconds: number) {
  let eventIndex = 0;
  let eventStart =
    TRANSIENT_MIN_INTERVAL_SECONDS +
    hashUnit(seed, eventIndex, 0xd2511f53) *
      (TRANSIENT_MAX_INTERVAL_SECONDS - TRANSIENT_MIN_INTERVAL_SECONDS);

  while (eventStart <= timeSeconds && eventIndex < 10_000) {
    const kindSelector = hashUnit(seed, eventIndex, 0xcd9e8d57);
    const kind: TransientKind =
      kindSelector < 0.58
        ? "satellite"
        : kindSelector < 0.73
          ? "plane"
          : "comet";
    const speedMultiplier =
      kind === "comet"
        ? 1.3 + hashUnit(seed, eventIndex, 0x243f6a88) * 0.2
        : 1;
    const duration = TRANSIENT_DURATIONS[kind] / speedMultiplier;
    if (timeSeconds < eventStart + duration) {
      const altitudeSelector = hashUnit(seed, eventIndex, 0x3956c25b);
      return {
        kind,
        progress: clamp((timeSeconds - eventStart) / duration, 0, 1),
        direction:
          hashUnit(seed, eventIndex, 0xe9b5dba5) > 0.5 ? 1 : -1,
        altitude:
          kind === "satellite"
            ? 0.12 + altitudeSelector * 0.18
            : kind === "comet"
              ? 0.34 + altitudeSelector * 0.18
              : 0.22 + altitudeSelector * 0.3,
        angle: getTransientAngle(kind, seed, eventIndex),
        variant: hashUnit(seed, eventIndex, 0x923f82a4),
      } satisfies TransientEvent;
    }

    eventIndex += 1;
    eventStart +=
      TRANSIENT_MIN_INTERVAL_SECONDS +
      hashUnit(seed, eventIndex, 0xd2511f53) *
        (TRANSIENT_MAX_INTERVAL_SECONDS - TRANSIENT_MIN_INTERVAL_SECONDS);
  }
  return null;
}

function getLocalTransientTestScenario() {
  const localHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (!localHost) return null;

  const requestedEvent = new URLSearchParams(window.location.search).get(
    "test-event",
  );
  if (requestedEvent === null) return null;
  const testSeeds: Record<TransientKind, number> = {
    satellite: 689,
    plane: 408,
    comet: 417,
  };
  const kind: TransientKind =
    requestedEvent === "satellite" || requestedEvent === "plane"
      ? requestedEvent
      : "comet";

  // Local QA can jump into the first event window without weakening the real
  // cadence or exposing a product control for forced sky events.
  return {
    offset: TRANSIENT_MIN_INTERVAL_SECONDS + 0.5,
    seed: testSeeds[kind],
  };
}

function drawTransientEvent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  event: TransientEvent,
) {
  const travel = event.direction > 0 ? event.progress : 1 - event.progress;
  const pathSpan = width * 1.16;
  const x = width * 0.5 + (travel - 0.5) * pathSpan;
  const y =
    height * event.altitude +
    (travel - 0.5) * pathSpan * Math.tan(event.angle) +
    Math.sin(event.progress * Math.PI) * height * 0.006;
  const visibility = Math.sin(event.progress * Math.PI);
  const scale = clamp(Math.min(width / 1440, height / 900), 0.8, 2.6);
  const heading = event.direction > 0 ? event.angle : event.angle + Math.PI;

  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = visibility;

  if (event.kind === "satellite") {
    context.globalCompositeOperation = "source-over";
    const trailLength = width * 0.008;
    const trailX = x - Math.cos(heading) * trailLength;
    const trailY = y - Math.sin(heading) * trailLength;
    const trail = context.createLinearGradient(trailX, trailY, x, y);
    trail.addColorStop(0, "rgb(190 204 222 / 0)");
    trail.addColorStop(1, "rgb(210 222 236 / 0.12)");
    context.strokeStyle = trail;
    context.lineWidth = scale * 0.4;
    context.beginPath();
    context.moveTo(trailX, trailY);
    context.lineTo(x, y);
    context.stroke();
    context.shadowColor = "rgb(190 207 226 / 0.3)";
    context.shadowBlur = 3 * scale;
    context.fillStyle = "rgb(218 226 235 / 0.56)";
    context.beginPath();
    context.arc(x, y, 0.7 * scale, 0, Math.PI * 2);
    context.fill();
  } else if (event.kind === "plane") {
    const strobe = Math.sin(event.progress * 86 + event.variant * 8) > 0.72;
    context.translate(x, y);
    context.rotate(heading);
    context.strokeStyle = "rgb(205 215 226 / 0.4)";
    context.lineWidth = scale * 0.7;
    context.beginPath();
    context.moveTo(-4 * scale, 0);
    context.lineTo(4 * scale, 0);
    context.stroke();
    context.shadowBlur = 5 * scale;
    context.shadowColor = "rgb(255 255 255 / 0.9)";
    context.fillStyle = strobe ? "#ffffff" : "rgb(255 255 255 / 0.3)";
    context.beginPath();
    context.arc(0, 0, (strobe ? 1.25 : 0.65) * scale, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 3 * scale;
    context.fillStyle = "rgb(255 55 45 / 0.9)";
    context.fillRect(-3.7 * scale, -0.5 * scale, scale, scale);
    context.fillStyle = "rgb(55 255 156 / 0.9)";
    context.fillRect(2.7 * scale, -0.5 * scale, scale, scale);
  } else {
    const tailLength = width * (0.07 + event.variant * 0.08);
    const tailX = x - Math.cos(heading) * tailLength;
    const tailY = y - Math.sin(heading) * tailLength;
    const tail = context.createLinearGradient(tailX, tailY, x, y);
    tail.addColorStop(0, "rgb(123 174 255 / 0)");
    tail.addColorStop(0.72, "rgb(186 215 255 / 0.22)");
    tail.addColorStop(1, "rgb(255 250 228 / 0.95)");
    context.strokeStyle = tail;
    context.lineCap = "round";
    context.lineWidth = 1.25 * scale;
    context.shadowColor = "rgb(139 186 255 / 0.55)";
    context.shadowBlur = 7 * scale;
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(x, y);
    context.stroke();
    context.fillStyle = "rgb(255 252 234)";
    context.beginPath();
    context.arc(x, y, 1.4 * scale, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawSky(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: SkySettings,
  twinkleTimeSeconds: number | null = null,
  cloudTimeSeconds: number | null = null,
) {
  if (settings.realisticMode) {
    drawRealisticSky(
      context,
      width,
      height,
      settings,
      twinkleTimeSeconds,
      cloudTimeSeconds,
    );
    return;
  }
  drawClassicSky(context, width, height, settings, twinkleTimeSeconds);
}

export function TwilightStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eventCanvasRef = useRef<HTMLCanvasElement>(null);
  const initialModeChosenRef = useRef(false);
  const cloudTimeRef = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteKey, setPaletteKey] = useState<PaletteKey>(DEFAULTS.palette);
  const [horizon, setHorizon] = useState(DEFAULTS.horizon);
  const [stars, setStars] = useState(DEFAULTS.stars);
  const [brightStars, setBrightStars] = useState(DEFAULTS.brightStars);
  const [starShape, setStarShape] = useState<StarShape>(DEFAULTS.starShape);
  const [twinkle, setTwinkle] = useState(false);
  const [realisticMode, setRealisticMode] = useState(false);
  const [mountainSoftness, setMountainSoftness] = useState(
    DEFAULTS.mountainSoftness,
  );
  const [showMasthead, setShowMasthead] = useState(true);
  const [seed, setSeed] = useState(DEFAULTS.seed);
  const [cloudSeed, setCloudSeed] = useState(DEFAULTS.seed ^ 0x9e3779b1);
  const [cloudDensity, setCloudDensity] = useState(DEFAULTS.cloudDensity);
  const [sizeId, setSizeId] = useState("4k");
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  const updateEnhancedMode = useCallback((enabled: boolean) => {
    setRealisticMode(enabled);
    if (enabled) setTwinkle(true);
    setExportStatus("");
  }, []);

  useEffect(() => {
    if (initialModeChosenRef.current) return;
    initialModeChosenRef.current = true;
    const draw = new Uint32Array(2);
    window.crypto.getRandomValues(draw);
    updateEnhancedMode(
      draw[0] % ENHANCED_MODE_CHANCES < ENHANCED_MODE_WINS,
    );
    setCloudSeed(draw[1]);
  }, [updateEnhancedMode]);

  const skySettings = useMemo<SkySettings>(
    () => ({
      palette: PALETTES[paletteKey],
      transition: horizon / 100,
      starDensity: stars / 100,
      brightStarDensity: brightStars / 100,
      starShape,
      seed,
      cloudSeed,
      cloudDensity: cloudDensity / 100,
      mountainSoftness: mountainSoftness / 100,
      realisticMode,
    }),
    [
      brightStars,
      cloudDensity,
      cloudSeed,
      horizon,
      mountainSoftness,
      paletteKey,
      realisticMode,
      seed,
      starShape,
      stars,
    ],
  );

  const renderPreview = useCallback(
    (animationTimeSeconds: number | null = null) => {
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
      if (skySettings.realisticMode && animationTimeSeconds !== null) {
        cloudTimeRef.current = animationTimeSeconds;
      }
      context.setTransform(density, 0, 0, density, 0, 0);
      drawSky(
        context,
        width,
        height,
        skySettings,
        twinkle ? animationTimeSeconds : null,
        skySettings.realisticMode ? animationTimeSeconds : null,
      );
    },
    [skySettings, twinkle],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionAllowed = !window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const shouldAnimate = (twinkle || realisticMode) && motionAllowed;
    let animationFrame = 0;
    let resizeFrame = 0;
    let lastPaint = -TWINKLE_FRAME_INTERVAL;

    const animate = (timestamp: number) => {
      if (timestamp - lastPaint >= TWINKLE_FRAME_INTERVAL) {
        renderPreview(timestamp / 1000);
        lastPaint = timestamp;
      }
      animationFrame = requestAnimationFrame(animate);
    };

    if (shouldAnimate) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      renderPreview();
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame((timestamp) => {
        renderPreview(shouldAnimate ? timestamp / 1000 : null);
      });
    });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
    };
  }, [realisticMode, renderPreview, twinkle]);

  useEffect(() => {
    const canvas = eventCanvasRef.current;
    if (!canvas) return;

    const motionAllowed = !window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let animationFrame = 0;
    let startTimestamp: number | null = null;
    let lastPaint = -TWINKLE_FRAME_INTERVAL;
    const transientTest = getLocalTransientTestScenario();

    const paint = (timeSeconds: number | null) => {
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
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (timeSeconds === null) {
        delete canvas.dataset.activeEvent;
        delete canvas.dataset.eventAngle;
        return;
      }
      context.setTransform(density, 0, 0, density, 0, 0);
      const transientSeed = transientTest?.seed ?? seed;
      const transientTime = timeSeconds + (transientTest?.offset ?? 0);
      if (transientTest) {
        canvas.dataset.eventClock = (
          transientTime
        ).toFixed(1);
      }
      const event = getTransientEvent(
        transientSeed,
        transientTime,
      );
      canvas.dataset.activeEvent = event?.kind ?? "";
      canvas.dataset.eventAngle = event
        ? ((event.angle * 180) / Math.PI).toFixed(1)
        : "";
      if (event) drawTransientEvent(context, width, height, event);
    };

    const animate = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp;
      if (timestamp - lastPaint >= TWINKLE_FRAME_INTERVAL) {
        paint((timestamp - startTimestamp) / 1000);
        lastPaint = timestamp;
      }
      animationFrame = requestAnimationFrame(animate);
    };

    if (realisticMode && motionAllowed) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      paint(null);
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      paint(null);
    };
  }, [realisticMode, seed]);

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

  const randomizeClouds = () => {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    setCloudSeed(values[0]);
    setExportStatus("");
  };

  const resetSky = () => {
    setPaletteKey(DEFAULTS.palette);
    setHorizon(DEFAULTS.horizon);
    setStars(DEFAULTS.stars);
    setBrightStars(DEFAULTS.brightStars);
    setStarShape(DEFAULTS.starShape);
    setTwinkle(false);
    setRealisticMode(false);
    setMountainSoftness(DEFAULTS.mountainSoftness);
    setShowMasthead(true);
    setSeed(DEFAULTS.seed);
    setCloudSeed(DEFAULTS.seed ^ 0x9e3779b1);
    setCloudDensity(DEFAULTS.cloudDensity);
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
      drawSky(
        context,
        width,
        height,
        skySettings,
        null,
        skySettings.realisticMode ? cloudTimeRef.current : null,
      );

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
      <canvas
        ref={eventCanvasRef}
        className="twilight-canvas twilight-events-canvas"
        aria-hidden="true"
      />

      {showMasthead ? (
        <header className="twilight-masthead" aria-label="Twilight wallpaper studio">
          <div className="twilight-masthead-line">
            <span className="twilight-signal" aria-hidden="true" />
            <button
              className="twilight-title"
              type="button"
              aria-pressed={realisticMode}
              aria-label={`Switch to ${realisticMode ? "classic" : "Enhanced"} Twilight`}
              onClick={() => updateEnhancedMode(!realisticMode)}
            >
              {realisticMode ? "Twilight (Enhanced)" : "Twilight"}
            </button>
          </div>
          <span className="twilight-kicker">
            {realisticMode
              ? "procedural nightscape · realistic field"
              : "IRIX sky study · deterministic field"}
          </span>
        </header>
      ) : null}

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
              <label className="twinkle-control realistic-control">
                <span>
                  <span className="control-label">Enhanced mode</span>
                  <span className="control-hint" id="realistic-description">
                    Adds a dense photographic star field, horizon-lit cirrus,
                    aurora, Appalachian ridgelines, and rare passing objects.
                  </span>
                </span>
                <input
                  className="twinkle-switch"
                  type="checkbox"
                  checked={realisticMode}
                  aria-describedby="realistic-description"
                  onChange={(event) => updateEnhancedMode(event.target.checked)}
                />
              </label>

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
                  min="0"
                  max="34"
                  value={horizon}
                  aria-describedby="horizon-glow-description"
                  onChange={(event) => {
                    setHorizon(Number(event.target.value));
                    setExportStatus("");
                  }}
                />
                <span className="control-hint" id="horizon-glow-description">
                  Adjusts the glow strength, vertical depth, and position while
                  keeping the Enhanced mountain horizon fixed.
                </span>
              </label>

              <label className="control-row">
                <span className="control-label">
                  Distant mountain softness
                  <span className="control-value">{mountainSoftness}%</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={mountainSoftness}
                  disabled={!realisticMode}
                  aria-describedby="mountain-softness-description"
                  onChange={(event) => {
                    setMountainSoftness(Number(event.target.value));
                    setExportStatus("");
                  }}
                />
                <span
                  className="control-hint"
                  id="mountain-softness-description"
                >
                  Softens the distant Enhanced ridges while keeping the
                  foreground silhouette crisp.
                </span>
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
                  disabled={realisticMode}
                  aria-describedby={
                    realisticMode ? "realistic-star-shape-description" : undefined
                  }
                  onChange={(event) => {
                    setStarShape(event.target.value as StarShape);
                    setExportStatus("");
                  }}
                >
                  <option value="cross">SGI cross · original</option>
                  <option value="diamond">Diamond · 5K reference</option>
                </select>
                {realisticMode ? (
                  <span
                    className="control-hint"
                    id="realistic-star-shape-description"
                  >
                    Enhanced mode uses natural optical star profiles.
                  </span>
                ) : null}
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

              <label className="control-row">
                <span className="control-label">
                  Cloud density
                  <span className="control-value">{cloudDensity}%</span>
                </span>
                <input
                  type="range"
                  min="100"
                  max="200"
                  step="10"
                  value={cloudDensity}
                  disabled={!realisticMode}
                  aria-describedby="cloud-density-description"
                  onChange={(event) => {
                    setCloudDensity(Number(event.target.value));
                    setExportStatus("");
                  }}
                />
                <span className="control-hint" id="cloud-density-description">
                  Adds independently placed cloud layers, allowing natural
                  overlap while preserving the current minimum.
                </span>
              </label>

              <div className="control-row">
                <span className="control-label">Cloud layout</span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={randomizeClouds}
                >
                  Shuffle clouds
                </button>
                <span className="control-hint">
                  Creates a new cloud arrangement without changing the stars.
                </span>
              </div>

              <label className="twinkle-control">
                <span>
                  <span className="control-label">Soft twinkle</span>
                  <span className="control-hint" id="twinkle-description">
                    Varies star brightness with slow atmospheric scintillation.
                  </span>
                </span>
                <input
                  className="twinkle-switch"
                  type="checkbox"
                  checked={twinkle}
                  aria-describedby="twinkle-description"
                  onChange={(event) => setTwinkle(event.target.checked)}
                />
              </label>

              <label className="twinkle-control">
                <span>
                  <span className="control-label">Show upper-left text</span>
                  <span className="control-hint" id="masthead-description">
                    Hides the title for a cleaner live preview.
                  </span>
                </span>
                <input
                  className="twinkle-switch"
                  type="checkbox"
                  checked={showMasthead}
                  aria-describedby="masthead-description"
                  onChange={(event) => setShowMasthead(event.target.checked)}
                />
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
              Repo:{" "}
              <a href="https://github.com/dylanwoo/Twilight_Redux" target="_blank" rel="noreferrer">
                dylanwoo/Twilight_Redux
              </a>
              . Inspired by Howard Look&apos;s SGI original.
              <span className="panel-dedication">
                Dedicated to Patty Ludwig — avid skywatcher.
              </span>
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

    </main>
  );
}
