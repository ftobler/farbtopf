import { Bitmap } from './bitmap'
import type { Rgba } from './color'

/**
 * Pure pixel helpers behind the text tool's rendering options: hard-edged
 * (aliased) text, and ClearType-style subpixel text emulated from a glyph
 * rasterised at three times the horizontal resolution.
 */

/** Glyph alpha at or above this counts as ink when anti-aliasing is off (50 %). */
export const TEXT_ALPHA_THRESHOLD = 128

/**
 * Low-pass filter run across neighbouring subpixels before they are split into
 * R, G and B. It spreads each subpixel's ink over its neighbours so a stem one
 * subpixel wide does not turn into a saturated colour fringe.
 */
export const SUBPIXEL_FILTER: readonly number[] = [1, 2, 3, 2, 1].map((weight) => weight / 9)

/** Per-pixel R, G, B coverage (0..1), three values per pixel, row by row. */
export interface SubpixelCoverage {
  width: number
  height: number
  data: Float32Array
}

export type TextRenderMode = 'aliased' | 'greyscale' | 'subpixel'

/**
 * How text with these options is put on the image at `angle` radians. Without
 * anti-aliasing it is always hard-edged. Subpixel rendering relies on the pixel
 * grid's horizontal R-G-B stripes, so a turned box falls back to greyscale.
 */
export function textRenderMode(options: { antialias: boolean; subpixel: boolean }, angle: number): TextRenderMode {
  if (!options.antialias) return 'aliased'
  return options.subpixel && angle === 0 ? 'subpixel' : 'greyscale'
}

/**
 * A copy of `source` in which every pixel is either `color` at full strength
 * (alpha >= `cutoff`) or fully transparent: text with hard pixel edges.
 */
export function thresholdAlpha(source: Bitmap, color: Rgba, cutoff = TEXT_ALPHA_THRESHOLD): Bitmap {
  const out = new Bitmap(source.width, source.height)
  const ink = { r: color.r, g: color.g, b: color.b, a: 255 }
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (source.get(x, y).a >= cutoff) out.set(x, y, ink)
    }
  }
  return out
}

/**
 * Runs `weights` (centred, odd length) along each row of a `width`×`height`
 * grid of subpixel coverages. Nothing is read past either end of a row.
 */
export function filterSubpixels(
  values: Float32Array,
  width: number,
  height: number,
  weights: readonly number[] = SUBPIXEL_FILTER,
): Float32Array {
  const out = new Float32Array(width * height)
  const reach = (weights.length - 1) / 2
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      for (let k = 0; k < weights.length; k += 1) {
        const at = x + k - reach
        if (at >= 0 && at < width) sum += values[row + at] * weights[k]
      }
      out[row + x] = sum
    }
  }
  return out
}

/**
 * Turns a glyph mask rasterised at three times the horizontal resolution (its
 * alpha is the ink) into per-channel coverage: the subpixels are filtered, then
 * each run of three becomes the R, G and B coverage of one output pixel.
 */
export function subpixelCoverage(source: Bitmap, weights: readonly number[] = SUBPIXEL_FILTER): SubpixelCoverage {
  const width = Math.ceil(source.width / 3)
  const height = source.height
  const columns = width * 3
  const raw = new Float32Array(columns * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < source.width; x += 1) raw[y * columns + x] = source.get(x, y).a / 255
  }
  return { width, height, data: filterSubpixels(raw, columns, height, weights) }
}

/**
 * Lays `color` over `dst` with the coverage's top-left at (`dx`,`dy`), each
 * channel by its own coverage: out = bg·(1−cov) + text·cov. Over pixels that
 * are not opaque the strongest channel's coverage becomes the added alpha.
 */
export function blendSubpixel(dst: Bitmap, coverage: SubpixelCoverage, dx: number, dy: number, color: Rgba): void {
  const strength = color.a / 255
  const text = [color.r, color.g, color.b]
  for (let y = 0; y < coverage.height; y += 1) {
    for (let x = 0; x < coverage.width; x += 1) {
      if (!dst.contains(dx + x, dy + y)) continue
      const i = (y * coverage.width + x) * 3
      const cover = [coverage.data[i] * strength, coverage.data[i + 1] * strength, coverage.data[i + 2] * strength]
      const most = Math.max(...cover)
      if (most <= 0) continue
      const under = dst.get(dx + x, dy + y)
      const ua = under.a / 255
      const outA = most + ua * (1 - most)
      const bg = [under.r, under.g, under.b]
      const [r, g, b] = cover.map((c, channel) => (text[channel] * c + bg[channel] * ua * (1 - c)) / outA)
      dst.set(dx + x, dy + y, { r, g, b, a: outA * 255 })
    }
  }
}
