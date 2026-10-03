import { BLACK, WHITE } from './color'

export interface PaletteColumn {
  top: string
  bottom: string
}

/** Palette columns: saturated colours on top, brighter pastels below. */
export const PALETTE_COLUMNS: readonly PaletteColumn[] = [
  { top: '#000000', bottom: '#ffffff' },
  { top: '#7f7f7f', bottom: '#c3c3c3' },
  { top: '#e81123', bottom: '#ffadb0' },
  { top: '#ff8c00', bottom: '#ffd3a3' },
  { top: '#ffd800', bottom: '#fff4a3' },
  { top: '#16a34a', bottom: '#a7e8b9' },
  { top: '#00a2e8', bottom: '#a6e3f7' },
  { top: '#2b4bd8', bottom: '#b0bdf5' },
  { top: '#8e44ad', bottom: '#d7b8ea' },
  { top: '#e3268f', bottom: '#f7b3d8' },
]

/** The swatches in render order: the grid fills column by column, top then bottom. */
export const DEFAULT_PALETTE: readonly string[] = PALETTE_COLUMNS.flatMap((column) => [column.top, column.bottom])

export const DEFAULT_PRIMARY = BLACK
export const DEFAULT_SECONDARY = WHITE

export interface CanvasPreset {
  label: string
  width: number
  height: number
}

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { label: '640 x 480', width: 640, height: 480 },
  { label: '800 x 600', width: 800, height: 600 },
  { label: '1024 x 768', width: 1024, height: 768 },
  { label: '1280 x 720', width: 1280, height: 720 },
  { label: '1920 x 1080', width: 1920, height: 1080 },
]

export const DEFAULT_CANVAS = { width: 640, height: 400 }
export const MIN_CANVAS = 16
export const MAX_CANVAS = 4096
