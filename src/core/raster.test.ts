import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, WHITE, rgba } from './color'
import {
  blit,
  crop,
  drawEllipse,
  drawLine,
  drawPolyline,
  drawRect,
  ellipseSpans,
  floodFill,
  linePoints,
  scale,
  stamp,
} from './raster'

const RED_OPAQUE = rgba(255, 0, 0)

function countColor(bitmap: Bitmap, color = BLACK): number {
  let count = 0
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const p = bitmap.get(x, y)
      if (p.r === color.r && p.g === color.g && p.b === color.b && p.a === color.a) count += 1
    }
  }
  return count
}

describe('linePoints', () => {
  it('is inclusive on a horizontal line', () => {
    expect(linePoints(0, 0, 3, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('handles perfect diagonals', () => {
    expect(linePoints(0, 0, 2, 2)).toHaveLength(3)
  })

  it('returns a single point for a zero-length line', () => {
    expect(linePoints(4, 4, 4, 4)).toEqual([{ x: 4, y: 4 }])
  })
})

describe('stamp', () => {
  it('draws a single pixel when size is one', () => {
    const bitmap = new Bitmap(5, 5)
    stamp(bitmap, 2, 2, 1, BLACK)
    expect(countColor(bitmap)).toBe(1)
    expect(bitmap.get(2, 2)).toEqual(BLACK)
  })

  it('draws a round plus for size three', () => {
    const bitmap = new Bitmap(5, 5)
    stamp(bitmap, 2, 2, 3, BLACK, 'round')
    expect(countColor(bitmap)).toBe(5)
    expect(bitmap.get(2, 2)).toEqual(BLACK)
    expect(bitmap.get(1, 1)).toEqual(rgba(0, 0, 0, 0))
  })

  it('draws a full square for size three', () => {
    const bitmap = new Bitmap(5, 5)
    stamp(bitmap, 2, 2, 3, BLACK, 'square')
    expect(countColor(bitmap)).toBe(9)
  })
})

describe('drawLine', () => {
  it('connects endpoints', () => {
    const bitmap = new Bitmap(5, 5)
    drawLine(bitmap, { x: 0, y: 0 }, { x: 4, y: 4 }, 1, BLACK)
    expect(bitmap.get(0, 0)).toEqual(BLACK)
    expect(bitmap.get(2, 2)).toEqual(BLACK)
    expect(bitmap.get(4, 4)).toEqual(BLACK)
  })
})

describe('drawPolyline', () => {
  it('leaves single points visible', () => {
    const bitmap = new Bitmap(5, 5)
    drawPolyline(bitmap, [{ x: 1, y: 1 }], 1, BLACK)
    expect(bitmap.get(1, 1)).toEqual(BLACK)
  })

  it('draws all segments', () => {
    const bitmap = new Bitmap(5, 5)
    drawPolyline(
      bitmap,
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
      1,
      BLACK,
    )
    expect(bitmap.get(2, 0)).toEqual(BLACK)
    expect(bitmap.get(2, 2)).toEqual(BLACK)
  })
})

describe('drawRect', () => {
  it('outlines without filling the interior', () => {
    const bitmap = new Bitmap(5, 5)
    drawRect(bitmap, { x: 1, y: 1, width: 3, height: 3 }, 1, BLACK, false)
    expect(bitmap.get(1, 1)).toEqual(BLACK)
    expect(bitmap.get(3, 3)).toEqual(BLACK)
    expect(bitmap.get(2, 2)).toEqual(rgba(0, 0, 0, 0))
  })

  it('fills the whole rectangle', () => {
    const bitmap = new Bitmap(5, 5)
    drawRect(bitmap, { x: 1, y: 1, width: 3, height: 3 }, 1, BLACK, true)
    expect(countColor(bitmap)).toBe(9)
  })
})

describe('ellipseSpans', () => {
  it('produces one span per row and stays inside the rect', () => {
    const spans = ellipseSpans({ x: 0, y: 0, width: 5, height: 5 })
    expect(spans).toHaveLength(5)
    for (const span of spans) {
      expect(span.x0).toBeGreaterThanOrEqual(0)
      expect(span.x1).toBeLessThanOrEqual(4)
      expect(span.x0).toBeLessThanOrEqual(span.x1)
    }
  })

  it('collapses a one-pixel-wide rect to a vertical line', () => {
    expect(ellipseSpans({ x: 2, y: 0, width: 1, height: 4 })).toHaveLength(4)
  })
})

describe('drawEllipse', () => {
  it('fills the center but not the corners', () => {
    const bitmap = new Bitmap(5, 5)
    drawEllipse(bitmap, { x: 0, y: 0, width: 5, height: 5 }, 1, BLACK, true)
    expect(bitmap.get(2, 2)).toEqual(BLACK)
    expect(bitmap.get(0, 0)).toEqual(rgba(0, 0, 0, 0))
  })

  it('outlines without filling the interior', () => {
    const bitmap = new Bitmap(7, 7)
    drawEllipse(bitmap, { x: 0, y: 0, width: 7, height: 7 }, 1, BLACK, false)
    expect(bitmap.get(3, 0)).toEqual(BLACK)
    expect(bitmap.get(3, 3)).toEqual(rgba(0, 0, 0, 0))
  })
})

describe('floodFill', () => {
  it('fills an enclosed region only', () => {
    const bitmap = new Bitmap(5, 5, WHITE)
    drawRect(bitmap, { x: 0, y: 0, width: 5, height: 5 }, 1, BLACK, false)
    const changed = floodFill(bitmap, { x: 2, y: 2 }, RED_OPAQUE)
    expect(changed).toBe(9)
    expect(bitmap.get(2, 2)).toEqual(RED_OPAQUE)
    expect(bitmap.get(0, 0)).toEqual(BLACK)
  })

  it('does nothing when the color already matches', () => {
    const bitmap = new Bitmap(3, 3, WHITE)
    expect(floodFill(bitmap, { x: 1, y: 1 }, WHITE)).toBe(0)
  })

  it('respects tolerance', () => {
    const bitmap = new Bitmap(3, 3)
    bitmap.fill(rgba(100, 100, 100))
    const changed = floodFill(bitmap, { x: 0, y: 0 }, BLACK, 20)
    expect(changed).toBe(9)
  })
})

describe('blit / crop / scale', () => {
  it('blits a source at an offset', () => {
    const dst = new Bitmap(5, 5)
    const src = new Bitmap(2, 2, BLACK)
    blit(dst, src, 1, 1)
    expect(dst.get(1, 1)).toEqual(BLACK)
    expect(dst.get(2, 2)).toEqual(BLACK)
    expect(dst.get(0, 0)).toEqual(rgba(0, 0, 0, 0))
  })

  it('crops a region', () => {
    const src = new Bitmap(4, 4, BLACK)
    const out = crop(src, { x: 1, y: 1, width: 2, height: 2 })
    expect(out.width).toBe(2)
    expect(out.get(0, 0)).toEqual(BLACK)
  })

  it('scales up by nearest neighbour', () => {
    const src = new Bitmap(2, 2, BLACK)
    src.set(0, 0, rgba(255, 0, 0))
    const out = scale(src, 4, 4)
    expect(out.width).toBe(4)
    expect(out.get(0, 0)).toEqual(rgba(255, 0, 0))
    expect(out.get(3, 3)).toEqual(BLACK)
  })
})
