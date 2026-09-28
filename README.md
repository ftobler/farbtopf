# Farbtopf

A tiny paint pot for your browser — an MS Paint (Windows 10/11) style image editor
built for quickly annotating and editing images without a heavyweight UI.

Built with React + TypeScript and Vite, deployed to GitHub Pages.

## Features

- Freehand tools: pencil, brush, airbrush, eraser
- Shapes: line, rectangle, ellipse (outline, filled, or outline + fill)
- Flood fill and color picker
- Text tool with multi-line support
- Primary/secondary colors, swatch palette, custom color picker, swap
- Undo/redo, clear canvas, pixel grid, zoom (25%–800%)
- New canvas presets, open images, save as PNG, paste images from the clipboard
- Dark and light themes (remembers your choice)
- Keyboard shortcuts

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm test         # run the unit tests
npm run lint     # lint
npm run build    # type-check and build for production
```

With [just](https://github.com/casey/just):

```bash
just install
just dev
just test
just lint
just build
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `P` `B` `A` `E` | Pencil, Brush, Airbrush, Eraser |
| `F` `K` `T` | Fill, Color picker, Text |
| `L` `R` `O` | Line, Rectangle, Ellipse |
| `[` `]` | Decrease / increase brush size |
| `X` | Swap primary and secondary colors |
| `G` | Toggle the pixel grid |
| `+` `-` | Zoom in / out |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | New / open / save |
| Right-click | Draw with the secondary color |

## Architecture

The drawing logic lives in `src/core` as pure, unit-tested functions operating on a
simple RGBA `Bitmap`, independent of the DOM. React components in `src/components`
render the UI and feed pointer input into those algorithms.

```
src/
  core/         bitmap, raster algorithms, history, color, geometry, tools
  render/       DOM canvas helpers (text rasterisation, image loading)
  components/   React UI (menu, toolbar, canvas, palette, dialogs)
  hooks/        theme
```

## Deployment

Pushing to `main` builds and publishes the app to GitHub Pages via
`.github/workflows/deploy.yml`. Enable Pages with the "GitHub Actions" source in the
repository settings.
