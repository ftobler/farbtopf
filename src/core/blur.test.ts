import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, WHITE, rgba } from './color'
import {
  BLUR_RADIUS_MAX,
  BLUR_RADIUS_MIN,
  blurSelection,
  blurSigma,
  gaussianBlur,
  gaussianKernel,
} from './blur'
import type { SelectionMask } from './selection'

function maskFrom(rows: string[]): SelectionMask {
  const width = rows[0].length
  const height = rows.length
  const data = new Uint8Array(width * height)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) data[y * width + x] = row[x] === '#' ? 1 : 0
  })
  return { width, height, data }
}

describe('blurSigma', () => {
  it('takes half the radius as the standard deviation', () => {
    expect(blurSigma(4)).toBe(2)
    expect(blurSigma(1)).toBe(0.5)
  })

  it('offers a sensible radius range', () => {
    expect(BLUR_RADIUS_MIN).toBeGreaterThan(0)
    expect(BLUR_RADIUS_MAX).toBeGreaterThan(BLUR_RADIUS_MIN)
  })
})

describe('gaussianKernel', () => {
  it('reaches three standard deviations and sums to one', () => {
    const kernel = gaussianKernel(4)
    // sigma 2 → half-width ceil(3 * 2) = 6
    expect(kernel).toHaveLength(13)
    const sum = kernel.reduce((total, weight) => total + weight, 0)
    expect(sum).toBeCloseTo(1, 6)
  })

  it('is a symmetric bell peaking in the middle', () => {
    const kernel = gaussianKernel(3)
    const mid = (kernel.length - 1) / 2
    for (let i = 0; i < mid; i += 1) {
      expect(kernel[i]).toBeCloseTo(kernel[kernel.length - 1 - i], 9)
      expect(kernel[i]).toBeLessThan(kernel[i + 1])
    }
  })

  it('follows the Gaussian curve', () => {
    const kernel = gaussianKernel(2)
    const mid = (kernel.length - 1) / 2
    // sigma 1: neighbour / centre = e^(-1/2)
    expect(kernel[mid + 1] / kernel[mid]).toBeCloseTo(Math.exp(-0.5), 6)
    expect(kernel[mid + 2] / kernel[mid]).toBeCloseTo(Math.exp(-2), 6)
  })

  it('is a single tap for a zero radius', () => {
    expect(Array.from(gaussianKernel(0))).toEqual([1])
  })
})

describe('blurSelection', () => {
  it('leaves a uniform colour unchanged', () => {
    const bitmap = new Bitmap(8, 8, rgba(40, 120, 200, 180))
    blurSelection(bitmap, { x: 0, y: 0, width: 8, height: 8 }, null, 3)
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) expect(bitmap.get(x, y)).toEqual(rgba(40, 120, 200, 180))
    }
  })

  it('spreads a single bright pixel by the kernel weights', () => {
    const bitmap = new Bitmap(15, 1, BLACK)
    bitmap.set(7, 0, WHITE)
    blurSelection(bitmap, { x: 0, y: 0, width: 15, height: 1 }, null, 2)
    const kernel = gaussianKernel(2)
    const mid = (kernel.length - 1) / 2
    for (let offset = -mid; offset <= mid; offset += 1) {
      expect(bitmap.get(7 + offset, 0).r).toBe(Math.round(255 * kernel[mid + offset]))
    }
    expect(bitmap.get(7, 0).a).toBe(255)
  })

  it('softens a hard edge symmetrically and monotonically', () => {
    const bitmap = new Bitmap(20, 4, BLACK)
    for (let y = 0; y < 4; y += 1) for (let x = 10; x < 20; x += 1) bitmap.set(x, y, WHITE)
    blurSelection(bitmap, { x: 0, y: 0, width: 20, height: 4 }, null, 4)
    const row = Array.from({ length: 20 }, (_, x) => bitmap.get(x, 1).r)
    for (let x = 1; x < 20; x += 1) expect(row[x]).toBeGreaterThanOrEqual(row[x - 1])
    expect(row[9]).toBeGreaterThan(0)
    expect(row[10]).toBeLessThan(255)
    expect(row[9] + row[10]).toBeGreaterThanOrEqual(254)
    expect(row[9] + row[10]).toBeLessThanOrEqual(256)
    expect(row[0]).toBe(0)
    expect(row[19]).toBe(255)
  })

  it('only touches pixels inside the rect and clamps sampling to its edge', () => {
    const bitmap = new Bitmap(10, 10, BLACK)
    for (let y = 3; y < 7; y += 1) for (let x = 3; x < 7; x += 1) bitmap.set(x, y, WHITE)
    blurSelection(bitmap, { x: 3, y: 3, width: 4, height: 4 }, null, 6)
    // Outside black is never sampled, so the white square stays white...
    for (let y = 3; y < 7; y += 1) for (let x = 3; x < 7; x += 1) expect(bitmap.get(x, y)).toEqual(WHITE)
    // ...and nothing outside the selection changes.
    expect(bitmap.get(2, 3)).toEqual(BLACK)
    expect(bitmap.get(7, 6)).toEqual(BLACK)
  })

  it('ignores the part of the rect outside the bitmap', () => {
    const bitmap = new Bitmap(4, 1, BLACK)
    bitmap.set(0, 0, WHITE)
    blurSelection(bitmap, { x: -3, y: -3, width: 10, height: 10 }, null, 2)
    expect(bitmap.get(0, 0).r).toBeGreaterThan(bitmap.get(1, 0).r)
    expect(bitmap.get(1, 0).r).toBeGreaterThan(0)
  })

  it('respects a free-form mask for both writing and sampling', () => {
    const bitmap = new Bitmap(6, 1, BLACK)
    bitmap.set(0, 0, WHITE)
    bitmap.set(1, 0, WHITE)
    bitmap.set(4, 0, WHITE)
    // Pixels 0, 1 and 4, 5 are selected; 2 and 3 are not.
    blurSelection(bitmap, { x: 0, y: 0, width: 6, height: 1 }, maskFrom(['##..##']), 3)
    // Run 0..1 is all white: no black is pulled in from the unselected gap.
    expect(bitmap.get(0, 0)).toEqual(WHITE)
    expect(bitmap.get(1, 0)).toEqual(WHITE)
    // Unselected pixels are untouched.
    expect(bitmap.get(2, 0)).toEqual(BLACK)
    expect(bitmap.get(3, 0)).toEqual(BLACK)
    // Run 4..5 mixes white and black, but only with each other.
    const left = bitmap.get(4, 0).r
    const right = bitmap.get(5, 0).r
    expect(left).toBeGreaterThan(right)
    expect(right).toBeGreaterThan(0)
    expect(left + right).toBeGreaterThanOrEqual(254)
    expect(left + right).toBeLessThanOrEqual(256)
  })

  it('blends in premultiplied alpha so transparent pixels add no colour', () => {
    const bitmap = new Bitmap(9, 1, rgba(255, 0, 0, 0))
    bitmap.set(4, 0, rgba(0, 0, 255, 255))
    blurSelection(bitmap, { x: 0, y: 0, width: 9, height: 1 }, null, 2)
    for (let x = 2; x <= 6; x += 1) {
      const pixel = bitmap.get(x, 0)
      expect(pixel.a).toBeGreaterThan(0)
      expect(pixel.a).toBeLessThan(255)
      expect(pixel.r).toBe(0)
      expect(pixel.b).toBe(255)
    }
  })

  it('does nothing for a zero radius', () => {
    const bitmap = new Bitmap(3, 1, BLACK)
    bitmap.set(1, 0, WHITE)
    blurSelection(bitmap, { x: 0, y: 0, width: 3, height: 1 }, null, 0)
    expect(bitmap.get(0, 0)).toEqual(BLACK)
    expect(bitmap.get(1, 0)).toEqual(WHITE)
  })
})

describe('gaussianBlur', () => {
  it('blurs the whole bitmap into a copy', () => {
    const source = new Bitmap(9, 9, BLACK)
    source.set(4, 4, WHITE)
    const result = gaussianBlur(source, 2)
    expect(source.get(4, 4)).toEqual(WHITE)
    expect(result.get(4, 4).r).toBeLessThan(255)
    expect(result.get(4, 4).r).toBeGreaterThan(result.get(5, 4).r)
    expect(result.get(5, 4).r).toBe(result.get(4, 5).r)
    expect(result.get(5, 5).r).toBeGreaterThan(0)
  })
})
