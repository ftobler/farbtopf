import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import {
  BRUSHES,
  HIGHLIGHTER_ALPHA,
  brushById,
  compositeHighlighter,
  createCoverageMask,
  isColorBrush,
  paintBrushStroke,
  stampHighlighter,
} from './brushes'
import { BLACK, WHITE } from './color'

function pixelData(bitmap: Bitmap): number[] {
  return Array.from(bitmap.data)
}

function rightmostDark(bitmap: Bitmap, y: number): number {
  let edge = -1
  for (let x = 0; x < bitmap.width; x += 1) {
    if (bitmap.get(x, y).r < 128) edge = x
  }
  return edge
}

function darkLeftHalf(width: number, height: number): Bitmap {
  const bitmap = new Bitmap(width, height, WHITE)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width / 2; x += 1) bitmap.set(x, y, BLACK)
  }
  return bitmap
}

function countNonWhite(bitmap: Bitmap): number {
  let count = 0
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (bitmap.get(x, y).r < 255) count += 1
    }
  }
  return count
}

describe('brushes', () => {
  it('lists the eight brushes in order', () => {
    expect(BRUSHES.map((brush) => brush.id)).toEqual([
      'round',
      'soft',
      'natural',
      'calligraphy',
      'highlighter',
      'blur',
      'smudge',
      'liquify',
    ])
    expect(BRUSHES.map((brush) => brush.label)).toEqual([
      'Circle sharp',
      'Circle blurred',
      'Natural brush',
      'Calligraphy pen',
      'Highlighter pen',
      'Selective blurring',
      'Smudge',
      'Liquify',
    ])
  })

  it('finds brushes by id', () => {
    expect(brushById('smudge').label).toBe('Smudge')
    expect(() => brushById('nope' as never)).toThrow()
  })

  it('knows which brushes lay down colour', () => {
    expect(isColorBrush('round')).toBe(true)
    expect(isColorBrush('natural')).toBe(true)
    expect(isColorBrush('highlighter')).toBe(true)
    expect(isColorBrush('blur')).toBe(false)
    expect(isColorBrush('smudge')).toBe(false)
    expect(isColorBrush('liquify')).toBe(false)
  })

  it('paints a crisp circle with the round brush', () => {
    const bitmap = new Bitmap(20, 20, WHITE)
    paintBrushStroke(bitmap, { x: 10, y: 10 }, { x: 10, y: 10 }, { size: 6, color: BLACK, brush: 'round' })
    expect(bitmap.get(10, 10).r).toBe(0)
    expect(bitmap.get(0, 0).r).toBe(255)
  })

  it('feathers the edge with the circle blurred brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 17, color: BLACK, brush: 'soft' })
    expect(bitmap.get(20, 20).r).toBeLessThan(10)
    const edge = bitmap.get(27, 20).r
    expect(edge).toBeGreaterThan(200)
    expect(edge).toBeLessThan(255)
  })

  it('scatters bristles with the natural brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 12, color: BLACK, brush: 'natural' })
    expect(countNonWhite(bitmap)).toBeGreaterThan(3)
  })

  it('paints a slanted nib with the calligraphy brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 12, color: BLACK, brush: 'calligraphy' })
    expect(countNonWhite(bitmap)).toBeGreaterThan(4)
    expect(bitmap.get(20, 20).r).toBeLessThan(255)
  })

  it('leaves translucent ink with the highlighter', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 12, color: BLACK, brush: 'highlighter' })
    const painted = bitmap.get(20, 20).r
    expect(painted).toBeGreaterThan(0)
    expect(painted).toBeLessThan(255)
  })

  it('softens a hard edge with selective blurring', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    bitmap.set(20, 20, BLACK)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 8, color: BLACK, brush: 'blur' })
    expect(bitmap.get(20, 20).r).toBeGreaterThan(0)
    expect(bitmap.get(21, 20).r).toBeLessThan(255)
  })

  it('drags colour along with the smudge brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 20; x += 1) bitmap.set(x, y, BLACK)
    }
    paintBrushStroke(bitmap, { x: 18, y: 20 }, { x: 22, y: 20 }, { size: 8, color: BLACK, brush: 'smudge' })
    expect(bitmap.get(21, 20).r).toBeLessThan(255)
  })

  it('pushes pixels with the liquify brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    bitmap.set(20, 20, BLACK)
    paintBrushStroke(bitmap, { x: 18, y: 20 }, { x: 22, y: 20 }, { size: 8, color: BLACK, brush: 'liquify' })
    expect(bitmap.get(22, 20).r).toBeLessThan(128)
  })

  it('paints a contiguous stroke along a drag whose length does not divide the spacing', () => {
    for (const size of [2, 3, 5, 8, 12, 20, 32]) {
      const bitmap = new Bitmap(60, 30, WHITE)
      paintBrushStroke(bitmap, { x: 2, y: 10 }, { x: 37, y: 10 }, { size, color: BLACK, brush: 'round' })
      for (let x = 2; x <= 37; x += 1) {
        expect(bitmap.get(x, 10).r, `size ${size} left a gap at x=${x}`).toBeLessThan(128)
      }
    }
  })

  it('paints at least one pixel with the soft brush at size 2', () => {
    const bitmap = new Bitmap(10, 10, WHITE)
    paintBrushStroke(bitmap, { x: 5, y: 5 }, { x: 5, y: 5 }, { size: 2, color: BLACK, brush: 'soft' })
    expect(countNonWhite(bitmap)).toBeGreaterThan(0)
  })

  it('keeps one flat alpha for overlapping highlighter segments', () => {
    const base = new Bitmap(40, 40, WHITE)
    const whole = createCoverageMask(40, 40)
    stampHighlighter(whole, { x: 8, y: 20 }, { x: 24, y: 20 }, 12)
    const single = compositeHighlighter(base, whole, BLACK, HIGHLIGHTER_ALPHA)

    const split = createCoverageMask(40, 40)
    stampHighlighter(split, { x: 8, y: 20 }, { x: 16, y: 20 }, 12)
    stampHighlighter(split, { x: 16, y: 20 }, { x: 24, y: 20 }, 12)
    const overlapped = compositeHighlighter(base, split, BLACK, HIGHLIGHTER_ALPHA)

    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        expect(overlapped.get(x, y), `pixel ${x},${y} darkened`).toEqual(single.get(x, y))
      }
    }
  })

  it('stamps an upright capital-I nib with a bar and wider caps', () => {
    const mask = createCoverageMask(40, 40)
    stampHighlighter(mask, { x: 20, y: 20 }, { x: 20, y: 20 }, 12)
    const coverage = (x: number, y: number) => mask.data[y * 40 + x]
    // The stem runs the full height through the centre.
    expect(coverage(20, 20)).toBeGreaterThan(0)
    expect(coverage(20, 15)).toBeGreaterThan(0)
    // The top and bottom caps are wider than the stem.
    expect(coverage(15, 15)).toBeGreaterThan(0)
    expect(coverage(15, 25)).toBeGreaterThan(0)
    // Mid-height only the narrow bar is painted.
    expect(coverage(15, 20)).toBe(0)
    expect(coverage(25, 20)).toBe(0)
    // Nothing is painted beyond the nib.
    expect(coverage(20, 13)).toBe(0)
  })

  it('bounds, keeps deterministic and matches fast against slow liquify drags', () => {
    const fast = darkLeftHalf(60, 40)
    paintBrushStroke(fast, { x: 20, y: 20 }, { x: 40, y: 20 }, { size: 20, color: BLACK, brush: 'liquify' })
    const again = darkLeftHalf(60, 40)
    paintBrushStroke(again, { x: 20, y: 20 }, { x: 40, y: 20 }, { size: 20, color: BLACK, brush: 'liquify' })
    expect(pixelData(again)).toEqual(pixelData(fast))

    // The feature moved, but no runaway: the edge cannot move further than the
    // brush radius (the original fixed-amplitude code moved it off the canvas).
    expect(rightmostDark(fast, 20)).toBeGreaterThan(30)
    expect(rightmostDark(fast, 20)).toBeLessThanOrEqual(30 + 10)

    // Splitting the same drag into many small moves agrees with one fast move.
    const slow = darkLeftHalf(60, 40)
    for (let x = 20; x < 40; x += 4) {
      paintBrushStroke(slow, { x, y: 20 }, { x: x + 4, y: 20 }, { size: 20, color: BLACK, brush: 'liquify' })
    }
    expect(rightmostDark(slow, 20)).toBeGreaterThan(30)
    expect(Math.abs(rightmostDark(fast, 20) - rightmostDark(slow, 20))).toBeLessThanOrEqual(2)
  })

  it('leaves the canvas untouched for a zero-length liquify segment', () => {
    const bitmap = darkLeftHalf(60, 40)
    const before = pixelData(bitmap)
    for (let i = 0; i < 10; i += 1) {
      paintBrushStroke(bitmap, { x: 30, y: 20 }, { x: 30, y: 20 }, { size: 20, color: BLACK, brush: 'liquify' })
    }
    expect(pixelData(bitmap)).toEqual(before)
  })
})
