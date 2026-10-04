import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { toCss } from '../core/color'
import type { SubpixelCoverage } from '../core/textRaster'
import { subpixelCoverage, thresholdAlpha } from '../core/textRaster'

export interface TextOptions {
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  /** Smooth glyph edges. Off gives hard pixel edges like classic Paint. */
  antialias: boolean
  /** ClearType-style LCD rendering; only applies with anti-aliasing on. */
  subpixel: boolean
}

export interface TextRenderOptions extends TextOptions {
  color: Rgba
  padding?: number
  lineHeight?: number
  /** When set, wraps the text to this many image pixels per line. */
  maxWidth?: number
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

/**
 * Line advance as a multiple of the font size. Kept in one place so the live
 * textarea and the committed bitmap agree to the pixel.
 */
export const TEXT_LINE_HEIGHT = 1.25

export const DEFAULT_TEXT_OPTIONS: TextOptions = {
  fontFamily: TEXT_FONT_STACK,
  fontSize: 24,
  bold: false,
  italic: false,
  underline: false,
  antialias: true,
  // Off by default: subpixel text only looks right at 100 % on an RGB-stripe LCD.
  // Zoomed, rotated, scaled, on phones/OLEDs or on BGR panels it shows colour
  // fringes, and an image outlives the screen it was made on.
  subpixel: false,
}

export function fontSizeForBrush(brushSize: number): number {
  return Math.max(12, Math.round(brushSize * 6))
}

function fontShorthand(options: TextOptions): string {
  const italic = options.italic ? 'italic ' : ''
  const weight = options.bold ? '700 ' : ''
  return `${italic}${weight}${options.fontSize}px ${options.fontFamily}`
}

type Measure = (value: string) => number

function breakWord(word: string, maxWidth: number, measure: Measure): string[] {
  const chunks: string[] = []
  let current = ''
  for (const character of word) {
    const candidate = current + character
    if (current.length > 0 && measure(candidate) > maxWidth) {
      chunks.push(current)
      current = character
    } else {
      current = candidate
    }
  }
  chunks.push(current)
  return chunks
}

function wrapParagraph(paragraph: string, maxWidth: number, measure: Measure): string[] {
  if (paragraph.length === 0) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of paragraph.split(' ')) {
    const candidate = current.length === 0 ? word : `${current} ${word}`
    if (measure(candidate) <= maxWidth) {
      current = candidate
      continue
    }
    if (current.length > 0) {
      lines.push(current)
      current = ''
    }
    if (measure(word) <= maxWidth) {
      current = word
      continue
    }
    const chunks = breakWord(word, maxWidth, measure)
    lines.push(...chunks.slice(0, -1))
    current = chunks[chunks.length - 1]
  }
  lines.push(current)
  return lines
}

function wrapLines(text: string, maxWidth: number, measure: Measure): string[] {
  return text.split('\n').flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measure))
}

/**
 * Lays out and rasterises a (possibly multi-line) string. The first baseline is
 * placed exactly where a CSS line box of the same line-height puts it, so the
 * committed text lines up with the live textarea. `scaleX` stretches only the
 * raster horizontally (3 for subpixel coverage); the layout stays in image pixels.
 */
function rasterise(
  text: string,
  options: TextRenderOptions,
  fill: string,
  scaleX: number,
): { image: ImageData; width: number; height: number } | null {
  const { padding = 2, lineHeight = TEXT_LINE_HEIGHT } = options

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null

  const font = fontShorthand(options)
  context.font = font

  const measure: Measure = (value) => context.measureText(value).width
  const { maxWidth } = options
  const wraps = maxWidth !== undefined && maxWidth > 0
  const lines = wraps
    ? wrapLines(text, Math.max(1, maxWidth - padding * 2), measure)
    : text.length > 0
      ? text.split('\n')
      : ['']
  const widest = Math.max(1, ...lines.map((line) => context.measureText(line).width))
  const lineHeightPx = options.fontSize * lineHeight
  const naturalWidth = Math.ceil(widest) + padding * 2
  const width = wraps ? Math.max(1, Math.min(Math.ceil(maxWidth), naturalWidth)) : naturalWidth
  const height = Math.ceil(lineHeightPx * lines.length + padding * 2)

  canvas.width = width * scaleX
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (scaleX !== 1) ctx.setTransform(scaleX, 0, 0, 1, 0, 0)
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = fill

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

  return { image: ctx.getImageData(0, 0, width * scaleX, height), width, height }
}

/**
 * Rasterises text into a transparent bitmap in the text colour. Without
 * anti-aliasing every pixel is the full colour or nothing (glyph alpha cut at 50 %).
 */
export function renderText(text: string, options: TextRenderOptions): Bitmap | null {
  const raster = rasterise(text, options, toCss(options.color), 1)
  if (!raster) return null
  const bitmap = Bitmap.fromImageData(raster.image)
  return options.antialias === false ? thresholdAlpha(bitmap, options.color) : bitmap
}

/**
 * Rasterises text for subpixel (ClearType-style) rendering: the glyphs are drawn
 * at three times the horizontal resolution and filtered into per-pixel R, G, B
 * coverage the same size as {@link renderText}'s bitmap. Lay it on the image with
 * `blendSubpixel`.
 */
export function renderTextSubpixel(text: string, options: TextRenderOptions): SubpixelCoverage | null {
  const raster = rasterise(text, options, '#000', 3)
  if (!raster) return null
  const coverage = subpixelCoverage(Bitmap.fromImageData(raster.image))
  return { ...coverage, width: raster.width }
}
