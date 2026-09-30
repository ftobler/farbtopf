import { BRUSH_SIZES } from './tools'
import type { ToolId } from './tools'

/**
 * Tools that paint a stroke and therefore carry a size (stroke width in image pixels)
 * and an opacity. The Stroke size dropdown only offers presets; the size itself can be
 * any whole pixel value from MIN_SIZE to MAX_SIZE (set from the floating size slider).
 *
 * Every sized tool keeps its own size and opacity, like Paint does: the pencil stays a
 * fine 1 px line while the eraser or a shape outline is wider, and switching tools never
 * silently changes another tool's stroke. Brush variants share the brush's settings.
 */
export const SIZED_TOOLS = ['pencil', 'brush', 'airbrush', 'eraser', 'shape'] as const

export type SizedTool = (typeof SIZED_TOOLS)[number]

export function isSizedTool(id: ToolId): id is SizedTool {
  return (SIZED_TOOLS as readonly ToolId[]).includes(id)
}

export interface ToolSettings {
  /** Stroke width in image pixels, MIN_SIZE..MAX_SIZE. */
  size: number
  /** Stroke opacity (strength) in percent, MIN_OPACITY..MAX_OPACITY. */
  opacity: number
}

export type ToolSettingsMap = Record<SizedTool, ToolSettings>

export const MIN_SIZE = 1
export const MAX_SIZE = 500
export const MIN_OPACITY = 1
export const MAX_OPACITY = 100

export const DEFAULT_TOOL_SETTINGS: ToolSettingsMap = {
  pencil: { size: 1, opacity: 100 },
  brush: { size: 4, opacity: 100 },
  airbrush: { size: 8, opacity: 100 },
  eraser: { size: 4, opacity: 100 },
  shape: { size: 4, opacity: 100 },
}

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_SIZE
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)))
}

export function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return MAX_OPACITY
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, Math.round(opacity)))
}

const clampUnit = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)
const LOG_RANGE = Math.log(MAX_SIZE / MIN_SIZE)

/**
 * Size slider position (0 = bottom, 1 = top) to a whole pixel size on a logarithmic
 * scale, so 1, 2, 3 px get as much of the track as 100, 200, 300 px do.
 */
export function sliderToSize(position: number): number {
  return clampSize(MIN_SIZE * Math.exp(clampUnit(position) * LOG_RANGE))
}

/** Inverse of `sliderToSize`: where a size sits on the track. Exact for every whole size. */
export function sizeToSlider(size: number): number {
  const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size))
  return Math.log(clamped / MIN_SIZE) / LOG_RANGE
}

/** Opacity slider position (0..1) to a whole percent; linear. */
export function sliderToOpacity(position: number): number {
  return clampOpacity(MIN_OPACITY + clampUnit(position) * (MAX_OPACITY - MIN_OPACITY))
}

export function opacityToSlider(opacity: number): number {
  return (clampOpacity(opacity) - MIN_OPACITY) / (MAX_OPACITY - MIN_OPACITY)
}

/** How much one step past the largest preset grows or shrinks the size. */
const LARGE_STEP = 1.25

/**
 * The next size for the [ and ] shortcuts: the neighbouring preset, and past the
 * largest preset a geometric step up to MAX_SIZE.
 */
export function stepSize(size: number, direction: 1 | -1): number {
  const current = clampSize(size)
  const presets: readonly number[] = BRUSH_SIZES
  const largest = presets[presets.length - 1]
  if (direction > 0) {
    const next = presets.find((preset) => preset > current)
    if (next !== undefined) return next
    return clampSize(Math.max(current + 1, current * LARGE_STEP))
  }
  if (current > largest) return Math.max(largest, clampSize(Math.min(current - 1, current / LARGE_STEP)))
  const previous = [...presets].reverse().find((preset) => preset < current)
  return previous ?? MIN_SIZE
}
