import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { toCss } from '../core/color'

export interface TextRenderOptions {
  fontSize: number
  color: Rgba
  fontFamily?: string
  padding?: number
  lineHeight?: number
}

export const TEXT_FONT_STACK =
  '"Segoe UI", "Trebuchet MS", system-ui, -apple-system, sans-serif'

export function fontSizeForBrush(brushSize: number): number {
  return Math.max(12, Math.round(brushSize * 6))
}

/** Rasterises a (possibly multi-line) string into a transparent bitmap. */
export function renderText(text: string, options: TextRenderOptions): Bitmap | null {
  const {
    fontSize,
    color,
    fontFamily = TEXT_FONT_STACK,
    padding = 2,
    lineHeight = 1.25,
  } = options

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null

  const font = `${fontSize}px ${fontFamily}`
  context.font = font

  const lines = text.length > 0 ? text.split('\n') : ['']
  const widest = Math.max(1, ...lines.map((line) => context.measureText(line).width))
  const lineHeightPx = Math.ceil(fontSize * lineHeight)
  const width = Math.ceil(widest) + padding * 2
  const height = lineHeightPx * lines.length + padding * 2

  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = font
  ctx.textBaseline = 'top'
  ctx.fillStyle = toCss(color)
  lines.forEach((line, index) => {
    ctx.fillText(line, padding, padding + index * lineHeightPx)
  })

  return Bitmap.fromImageData(ctx.getImageData(0, 0, width, height))
}
