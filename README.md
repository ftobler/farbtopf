# Farbtopf

*A tiny paint pot for your browser*

A simple image editor built for quickly annotating and editing images without a heavyweight UI.

Built with React + TypeScript and Vite, deployed to GitHub Pages.

## Features

- Freehand tools: pencil, brush, airbrush, eraser
- Shapes: line, rectangle, ellipse (outline, filled, or outline + fill)
- Flood fill and color picker
- Rectangular, free-form and object selection (drag a box around an object, or click it)
- Remove tool: paint over something and it is filled in from its surroundings (a loop drawn around an object removes what it encloses)
- Text tool with multi-line support
- Primary/secondary colors, swatch palette, custom color picker, swap
- Undo/redo, clear canvas, pixel grid, zoom (25%–800%)
- New canvas presets, open images, save as PNG, paste images from the clipboard
- Dark and light themes (remembers your choice)
- Keyboard shortcuts

## Getting started

Object selection and the Remove tool run as WebAssembly built from `wasm/`, so building and testing also need
[Rust](https://rustup.rs) with the WebAssembly target:

```bash
rustup target add wasm32-unknown-unknown
```

```bash
npm install
npm run dev      # start the dev server
npm test         # run the unit tests
npm run lint     # lint
npm run build    # type-check and build for production
npm run wasm     # build only the WebAssembly module (npm test, dev and build do it first)
```

With [just](https://github.com/casey/just):

```bash
just install
just dev
just test
just lint
just build
just wasm        # build the WebAssembly module
just wasm-test   # run its Rust tests
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `P` `B` `A` `E` | Pencil, Brush, Airbrush, Eraser |
| `J` | Remove |
| `F` `K` `T` | Fill, Color picker, Text |
| `L` `R` `O` | Line, Rectangle, Ellipse |
| `[` `]` | Decrease / increase brush size |
| `X` | Swap primary and secondary colors |
| `G` | Toggle the pixel grid |
| `+` `-` | Zoom in / out |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | New / open / save |
| Right-click | Open the canvas context menu |

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
  wasm/         the built WebAssembly module (generated, not committed)
wasm/           Rust image algorithms compiled to WebAssembly (object selection, Remove tool)
```

Object selection (GrabCut with Boykov–Kolmogorov graph cuts) and the Remove tool (non-local
patch-based inpainting with Poisson seam blending) are adapted from
[PhotoCraft](https://github.com/storytold/photocraft), MIT licensed; its licence is in
`wasm/LICENSE-photocraft`. They run in a Web Worker (`src/render/algorithms.worker.ts`).

## Deployment

Farbtopf is hosted on GitHub Pages: https://ftobler.github.io/farbtopf/
