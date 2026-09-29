import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { toCss } from '../core/color'

export interface TextOptions {
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface TextRenderOptions extends TextOptions {
  color: Rgba
  padding?: number
  lineHeight?: number
}

export const TEXT_FONT_STACK =
  '"Segoe UI", "Trebuchet MS", system-ui, -apple-system, sans-serif'

export const FONT_FAMILIES: readonly { label: string; value: string }[] = [
  { label: 'Segoe UI', value: TEXT_FONT_STACK },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", "Comic Sans", cursive' },
]

export const DEFAULT_TEXT_OPTIONS: TextOptions = {
  fontFamily: TEXT_FONT_STACK,
  fontSize: 24,
  bold: false,
  italic: false,
  underline: false,
}

export function fontSizeForBrush(brushSize: number): number {
  return Math.max(12, Math.round(brushSize * 6))
}

function fontShorthand(options: TextOptions): string {
  const italic = options.italic ? 'italic ' : ''
  const weight = options.bold ? '700 ' : ''
  return `${italic}${weight}${options.fontSize}px ${options.fontFamily}`
}

/**
 * Rasterises a (possibly multi-line) string into a transparent bitmap. The first
 * baseline is placed exactly where a CSS line box of the same line-height puts it,
 * so the committed text lines up with the live textarea.
 */
export function renderText(text: string, options: TextRenderOptions): Bitmap | null {
  const { color, padding = 2, lineHeight = 1.25 } = options

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null

  const font = fontShorthand(options)
  context.font = font

  const lines = text.length > 0 ? text.split('\n') : ['']
  const widest = Math.max(1, ...lines.map((line) => context.measureText(line).width))
  const lineHeightPx = Math.ceil(options.fontSize * lineHeight)
  const width = Math.ceil(widest) + padding * 2
  const height = lineHeightPx * lines.length + padding * 2

  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = toCss(color)

  const metrics = ctx.measureText('Mg')
  const ascent = metrics.fontBoundingBoxAscent || options.fontSize * 0.8
  const descent = metrics.fontBoundingBoxDescent || options.fontSize * 0.2
  const firstBaseline = padding + (lineHeightPx - (ascent + descent)) / 2 + ascent
  const underlineThickness = Math.max(1, Math.round(options.fontSize / 14))
  const underlineOffset = Math.max(1, Math.round(options.fontSize * 0.08))

  lines.forEach((line, index) => {
    const baseline = firstBaseline + index * lineHeightPx
    ctx.fillText(line, padding, baseline)
    if (options.underline) {
      const lineWidth = ctx.measureText(line).width
      ctx.fillRect(padding, baseline + underlineOffset, lineWidth, underlineThickness)
    }
  })

  return Bitmap.fromImageData(ctx.getImageData(0, 0, width, height))
}
