import { BLACK, WHITE } from './color'

/** The default two-row swatch palette, in the spirit of classic MS Paint. */
export const DEFAULT_PALETTE: readonly string[] = [
  '#000000',
  '#7f7f7f',
  '#880015',
  '#ed1c24',
  '#ff7f27',
  '#fff200',
  '#22b14c',
  '#00a2e8',
  '#3f48cc',
  '#a349a4',
  '#b97a57',
  '#ffaec9',
  '#7f6b3f',
  '#ffffff',
  '#c8c8c8',
  '#e6b8af',
  '#ffc90e',
  '#efe4b0',
  '#b5e61d',
  '#99d9ea',
  '#7092be',
  '#c3c3c3',
  '#a0e7a0',
  '#d5e8d4',
  '#ffe599',
  '#ffcccc',
  '#0000a0',
  '#f5f5f5',
]

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

export const DEFAULT_CANVAS = { width: 800, height: 600 }
export const MIN_CANVAS = 16
export const MAX_CANVAS = 4096
