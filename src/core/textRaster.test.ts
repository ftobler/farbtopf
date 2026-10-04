import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import type { Rgba } from './color'
import { BLACK, WHITE } from './color'
import {
  SUBPIXEL_FILTER,
  blendSubpixel,
  filterSubpixels,
  subpixelCoverage,
  textRenderMode,
  thresholdAlpha,
} from './textRaster'

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }

/** A one-row bitmap whose pixels carry the given alphas (colour irrelevant). */
function alphaRow(alphas: number[], color: Rgba = BLACK): Bitmap {
  const bitmap = new Bitmap(alphas.length, 1)
  alphas.forEach((a, x) => bitmap.set(x, 0, { ...color, a }))
  return bitmap
}

describe('thresholdAlpha', () => {
  it('turns every pixel into full text colour or nothing, cutting at half coverage', () => {
    const source = alphaRow([0, 1, 127, 128, 200, 255], { r: 10, g: 10, b: 10, a: 0 })
    const out = thresholdAlpha(source, RED)
    expect([0, 1, 2, 3, 4, 5].map((x) => out.get(x, 0))).toEqual([
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 0, g: 0, b: 0, a: 0 },
      RED,
      RED,
      RED,
    ])
  })

  it('leaves the source untouched and keeps its size', () => {
    const source = alphaRow([100, 200])
    const out = thresholdAlpha(source, RED)
    expect(out).not.toBe(source)
    expect(out.width).toBe(2)
    expect(source.get(0, 0).a).toBe(100)
  })

  it('only ever produces alpha 0 or 255', () => {
    const source = alphaRow(Array.from({ length: 256 }, (_, i) => i))
    const out = thresholdAlpha(source, BLACK)
    for (let x = 0; x < 256; x += 1) expect([0, 255]).toContain(out.get(x, 0).a)
  })
})

describe('filterSubpixels', () => {
  it('uses a normalised five-tap filter', () => {
    expect(SUBPIXEL_FILTER).toHaveLength(5)
    expect(SUBPIXEL_FILTER.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 10)
    expect(SUBPIXEL_FILTER[2]).toBeCloseTo(3 / 9, 10)
  })

  it('spreads a single lit subpixel over its neighbours by the filter weights', () => {
    const row = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0])
    const out = filterSubpixels(row, 9, 1)
    expect(Array.from(out).map((v) => Math.round(v * 9))).toEqual([0, 0, 1, 2, 3, 2, 1, 0, 0])
  })

  it('keeps full coverage full in the middle of a solid run', () => {
    const row = new Float32Array(9).fill(1)
    const out = filterSubpixels(row, 9, 1)
    expect(out[4]).toBeCloseTo(1, 6)
    // The edges fade, as the filter reads nothing past the row.
    expect(out[0]).toBeCloseTo(6 / 9, 6)
  })

  it('filters each row on its own', () => {
    const rows = new Float32Array([1, 0, 0, 0, 0, 0, /* row 2 */ 0, 0, 0, 0, 0, 0])
    const out = filterSubpixels(rows, 6, 2)
    expect(Array.from(out.slice(6))).toEqual([0, 0, 0, 0, 0, 0])
  })
})

describe('subpixelCoverage', () => {
  it('maps each three subpixels to the R, G and B coverage of one pixel', () => {
    // Six subpixels: only the very first is lit (alpha 255), so pixel 0 is red-heavy.
    const source = alphaRow([255, 0, 0, 0, 0, 0])
    const coverage = subpixelCoverage(source)
    expect(coverage.width).toBe(2)
    expect(coverage.height).toBe(1)
    const nine = Array.from(coverage.data).map((v) => Math.round(v * 9))
    expect(nine).toEqual([3, 2, 1, 0, 0, 0])
  })

  it('gives fully covered pixels equal coverage on every channel', () => {
    const source = alphaRow(new Array(15).fill(255))
    const coverage = subpixelCoverage(source)
    expect(coverage.width).toBe(5)
    const middle = Array.from(coverage.data.slice(6, 9))
    middle.forEach((v) => expect(v).toBeCloseTo(1, 6))
  })

  it('rounds a width that is not a multiple of three up', () => {
    expect(subpixelCoverage(alphaRow([255, 255, 255, 255])).width).toBe(2)
  })
})

describe('blendSubpixel', () => {
  const coverageOf = (values: number[], width: number) => ({
    width,
    height: values.length / 3 / width,
    data: new Float32Array(values),
  })

  it('blends each channel by its own coverage: bg*(1-cov) + text*cov', () => {
    const dst = new Bitmap(2, 1, WHITE)
    blendSubpixel(dst, coverageOf([1, 0.5, 0, 0, 0, 0], 2), 0, 0, BLACK)
    expect(dst.get(0, 0)).toEqual({ r: 0, g: 128, b: 255, a: 255 })
    expect(dst.get(1, 0)).toEqual(WHITE)
  })

  it('places the coverage at the given offset and clips outside the bitmap', () => {
    const dst = new Bitmap(2, 2, WHITE)
    blendSubpixel(dst, coverageOf([1, 1, 1, 1, 1, 1], 2), 1, 1, RED)
    expect(dst.get(1, 1)).toEqual(RED)
    expect(dst.get(0, 0)).toEqual(WHITE)
    expect(dst.get(0, 1)).toEqual(WHITE)
  })

  it('scales coverage by the text colour alpha', () => {
    const dst = new Bitmap(1, 1, WHITE)
    blendSubpixel(dst, coverageOf([1, 1, 1], 1), 0, 0, { r: 0, g: 0, b: 0, a: 0 })
    expect(dst.get(0, 0)).toEqual(WHITE)
  })

  it('lays text over a transparent pixel with the strongest channel as alpha', () => {
    const dst = new Bitmap(1, 1)
    blendSubpixel(dst, coverageOf([1, 1, 1], 1), 0, 0, RED)
    expect(dst.get(0, 0)).toEqual(RED)
    const faint = new Bitmap(1, 1)
    blendSubpixel(faint, coverageOf([0.5, 0.25, 0], 1), 0, 0, BLACK)
    expect(faint.get(0, 0).a).toBe(128)
  })

  it('leaves pixels with no coverage alone', () => {
    const dst = new Bitmap(1, 1, { r: 1, g: 2, b: 3, a: 40 })
    blendSubpixel(dst, coverageOf([0, 0, 0], 1), 0, 0, BLACK)
    expect(dst.get(0, 0)).toEqual({ r: 1, g: 2, b: 3, a: 40 })
  })
})

describe('textRenderMode', () => {
  it('is greyscale anti-aliasing by default', () => {
    expect(textRenderMode({ antialias: true, subpixel: false }, 0)).toBe('greyscale')
  })

  it('is subpixel only when anti-aliased and upright', () => {
    expect(textRenderMode({ antialias: true, subpixel: true }, 0)).toBe('subpixel')
    expect(textRenderMode({ antialias: true, subpixel: true }, 0.3)).toBe('greyscale')
  })

  it('is hard-edged whenever anti-aliasing is off, whatever the subpixel setting', () => {
    expect(textRenderMode({ antialias: false, subpixel: false }, 0)).toBe('aliased')
    expect(textRenderMode({ antialias: false, subpixel: true }, 0)).toBe('aliased')
    expect(textRenderMode({ antialias: false, subpixel: true }, 1)).toBe('aliased')
  })
})
