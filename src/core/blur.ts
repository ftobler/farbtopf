import { Bitmap } from './bitmap'
import type { Rect } from './geometry'
import { isSelected } from './selection'
import type { SelectionMask } from './selection'

/** The smallest and largest blur radius the Blur dialog accepts, in pixels. */
export const BLUR_RADIUS_MIN = 0.5
export const BLUR_RADIUS_MAX = 50

/**
 * The Gaussian standard deviation for a blur `radius`. Like the canvas
 * `shadowBlur` convention, the radius is twice the standard deviation, so the
 * visible softening spreads roughly `radius` pixels either way while the kernel
 * itself (cut off at three standard deviations) reaches 1.5 × radius.
 */
export function blurSigma(radius: number): number {
  return radius / 2
}

/** A normalised 1-D Gaussian kernel for `radius`, with ⌈3σ⌉ taps either side of the centre. */
export function gaussianKernel(radius: number): Float64Array {
  const sigma = blurSigma(radius)
  if (!(sigma > 0)) return Float64Array.of(1)
  const half = Math.ceil(3 * sigma)
  const kernel = new Float64Array(half * 2 + 1)
  let sum = 0
  for (let i = -half; i <= half; i += 1) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel[i + half] = weight
    sum += weight
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum
  return kernel
}

/**
 * Convolves the selected runs along one axis. `index(line, step)` maps a line
 * and a position along it to a pixel slot; samples past the end of a run of
 * selected pixels are clamped to that run's first or last pixel.
 */
function convolveRuns(
  input: Float64Array,
  output: Float64Array,
  selected: Uint8Array,
  lines: number,
  length: number,
  index: (line: number, step: number) => number,
  kernel: Float64Array,
): void {
  const half = (kernel.length - 1) / 2
  for (let line = 0; line < lines; line += 1) {
    let step = 0
    while (step < length) {
      if (!selected[index(line, step)]) {
        step += 1
        continue
      }
      const start = step
      while (step < length && selected[index(line, step)]) step += 1
      const end = step - 1
      for (let at = start; at <= end; at += 1) {
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        for (let k = -half; k <= half; k += 1) {
          const from = index(line, Math.min(end, Math.max(start, at + k))) * 4
          const weight = kernel[k + half]
          r += input[from] * weight
          g += input[from + 1] * weight
          b += input[from + 2] * weight
          a += input[from + 3] * weight
        }
        const to = index(line, at) * 4
        output[to] = r
        output[to + 1] = g
        output[to + 2] = b
        output[to + 3] = a
      }
    }
  }
}

/**
 * Applies a true (separable) Gaussian blur of `radius` pixels to the selected
 * pixels of `bitmap`, in place. Only pixels inside `rect`, the optional `mask`
 * and the bitmap are read or written: sampling clamps to the edge of the
 * selection (per row/column run), so nothing outside bleeds in. Colours are
 * blended premultiplied by alpha so transparent pixels contribute no colour.
 */
export function blurSelection(bitmap: Bitmap, rect: Rect, mask: SelectionMask | null, radius: number): void {
  const kernel = gaussianKernel(radius)
  if (kernel.length === 1) return
  const left = Math.max(0, rect.x)
  const top = Math.max(0, rect.y)
  const width = Math.min(bitmap.width, rect.x + rect.width) - left
  const height = Math.min(bitmap.height, rect.y + rect.height) - top
  if (width <= 0 || height <= 0) return

  const selected = new Uint8Array(width * height)
  const pixels = new Float64Array(width * height * 4)
  const { data } = bitmap
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const slot = y * width + x
      if (!isSelected(rect, mask, left + x, top + y)) continue
      selected[slot] = 1
      const i = ((top + y) * bitmap.width + left + x) * 4
      const alpha = data[i + 3] / 255
      pixels[slot * 4] = data[i] * alpha
      pixels[slot * 4 + 1] = data[i + 1] * alpha
      pixels[slot * 4 + 2] = data[i + 2] * alpha
      pixels[slot * 4 + 3] = data[i + 3]
    }
  }

  const across = new Float64Array(pixels.length)
  convolveRuns(pixels, across, selected, height, width, (y, x) => y * width + x, kernel)
  convolveRuns(across, pixels, selected, width, height, (x, y) => y * width + x, kernel)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const slot = y * width + x
      if (!selected[slot]) continue
      const i = ((top + y) * bitmap.width + left + x) * 4
      const alpha = pixels[slot * 4 + 3]
      const unpremultiply = alpha > 0 ? 255 / alpha : 0
      data[i] = Math.round(pixels[slot * 4] * unpremultiply)
      data[i + 1] = Math.round(pixels[slot * 4 + 1] * unpremultiply)
      data[i + 2] = Math.round(pixels[slot * 4 + 2] * unpremultiply)
      data[i + 3] = Math.round(alpha)
    }
  }
}

/** Returns a copy of `source` with a Gaussian blur of `radius` pixels over the whole image. */
export function gaussianBlur(source: Bitmap, radius: number): Bitmap {
  const result = source.clone()
  blurSelection(result, { x: 0, y: 0, width: source.width, height: source.height }, null, radius)
  return result
}
