# Twilight Redux

Twilight Redux is a browser-based wallpaper generator inspired by Howard
Look's classic 1991 Silicon Graphics IRIX `twilight` background. It recreates
the original orange-to-blue-to-black sky, deterministic point stars, and larger
shaped stars while adding modern high-DPI PNG export.

Public Sites deployment:
[sgi-twilight-studio.dylanwoo757047.chatgpt.site](https://sgi-twilight-studio.dylanwoo757047.chatgpt.site)

## Features

- Full-screen, responsive canvas preview.
- Authentic SGI palette plus two restrained alternatives.
- Adjustable horizon, star density, large-star density, and deterministic seed.
- Original SGI cross stars or high-DPI diamond stars.
- Optional, reduced-motion-aware atmospheric twinkle preview.
- Full HD, QHD, ultra-wide, 4K, 5K, and custom PNG export.
- Export files contain only the rendered wallpaper, never the interface.
- Keyboard-accessible settings panel opened by the bottom-left gear.

## Reference implementations

This project is informed by two modern recreations of the original program:

- [bcaluneo/twilight](https://github.com/bcaluneo/twilight), maintained by
  Brendan Caluneo. This SDL/C++ implementation closely follows Howard Look's
  original gradient and star-color behavior.
- [joelbraun/twilight](https://github.com/joelbraun/twilight), maintained by
  Joel Braun. This standalone C generator adapts the wallpaper for 5K output,
  including high-DPI star scaling, capped reference counts, and a diamond-star
  option.

Howard Look wrote the original Silicon Graphics `twilight` program. The
original SGI source and its copyright and warranty notice are preserved in both
reference repositories. See [NOTICE.md](NOTICE.md) for this project's
attribution details.

## Run locally

Requirements:

- Node.js 22.13 or newer
- npm

Install dependencies and start the development site:

```bash
npm ci
npm run dev
```

Then open `http://localhost:3000`.

## Validate a production build

```bash
npm run build
node --test tests/rendered-html.test.mjs
```

## Key files

- `app/TwilightStudio.tsx` contains the canvas renderer, controls, and PNG
  export workflow.
- `app/globals.css` contains the responsive interface styling.
- `app/page.tsx` and `app/layout.tsx` provide the page and metadata.
- `tests/rendered-html.test.mjs` verifies the rendered product surface and
  attribution.
- `.openai/hosting.json` contains the Sites project binding.

## Technology

The site uses React 19, TypeScript, the Next-compatible vinext runtime, and the
browser's native 2D Canvas API. The renderer has no image-processing dependency:
the preview and downloaded wallpapers are produced by the same deterministic
code path.
