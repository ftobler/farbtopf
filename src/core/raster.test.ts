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
  extractRegion,
  fillPolygon,
  flipHorizontal,
  flipVertical,
  floodFill,
  invertColors,
  linePoints,
  rotate90,
  rotate180,
  rotate270,
  rotateBy,
  rotatedSize,
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

  it('grows monotonically with size, including even sizes', () => {
    let previous = 0
    for (let size = 1; size <= 8; size += 1) {
      const bitmap = new Bitmap(size + 2, size + 2)
      stamp(bitmap, Math.floor((size + 2) / 2), Math.floor((size + 2) / 2), size, BLACK, 'round')
      const painted = countColor(bitmap)
      expect(painted, `size ${size}`).toBeGreaterThan(previous)
      previous = painted
    }
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

  it('is horizontally symmetric for even-width rects', () => {
    const spans = ellipseSpans({ x: 0, y: 0, width: 4, height: 6 })
    for (const span of spans) {
      expect(span.x0 + span.x1).toBe(3)
    }
  })
})

describe('drawEllipse even sizes', () => {
  it('keeps every row of a 2×2 ellipse instead of dropping the left column', () => {
    const bitmap = new Bitmap(2, 2)
    drawEllipse(bitmap, { x: 0, y: 0, width: 2, height: 2 }, 1, BLACK, true)
    expect(countColor(bitmap)).toBe(4)
  })

  it('draws a 4×4 filled ellipse symmetric about both axes', () => {
    const bitmap = new Bitmap(4, 4)
    drawEllipse(bitmap, { x: 0, y: 0, width: 4, height: 4 }, 1, BLACK, true)
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const painted = countPaintedPixel(bitmap, x, y)
        expect(painted, `mirror x at ${x},${y}`).toBe(countPaintedPixel(bitmap, 3 - x, y))
        expect(painted, `mirror y at ${x},${y}`).toBe(countPaintedPixel(bitmap, x, 3 - y))
      }
    }
  })

  it('closes the top cap of a circle outline', () => {
    const bitmap = new Bitmap(7, 7)
    drawEllipse(bitmap, { x: 0, y: 0, width: 7, height: 7 }, 1, BLACK, false)
    expect(bitmap.get(2, 0)).toEqual(BLACK)
    expect(bitmap.get(3, 0)).toEqual(BLACK)
    expect(bitmap.get(4, 0)).toEqual(BLACK)
  })

  it('keeps a thick outline inside the dragged box', () => {
    const bitmap = new Bitmap(12, 12)
    drawEllipse(bitmap, { x: 3, y: 3, width: 6, height: 6 }, 5, BLACK, false)
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 12; x += 1) {
        if (x >= 3 && x <= 8 && y >= 3 && y <= 8) continue
        expect(bitmap.get(x, y)).toEqual(rgba(0, 0, 0, 0))
      }
    }
  })
})

function countPaintedPixel(bitmap: Bitmap, x: number, y: number): number {
  return bitmap.get(x, y).r === 0 ? 1 : 0
}

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

describe('extractRegion', () => {
  it('extracts a region preserving pixels', () => {
    const src = new Bitmap(4, 4, BLACK)
    const out = extractRegion(src, { x: 1, y: 1, width: 2, height: 2 })
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(out.get(0, 0)).toEqual(BLACK)
    expect(out.get(1, 1)).toEqual(BLACK)
  })

  it('makes key-coloured pixels transparent', () => {
    const src = new Bitmap(2, 2, BLACK)
    src.set(0, 0, WHITE)
    const out = extractRegion(src, { x: 0, y: 0, width: 2, height: 2 }, WHITE)
    expect(out.get(0, 0)).toEqual(rgba(0, 0, 0, 0))
    expect(out.get(1, 0)).toEqual(BLACK)
  })

  it('turns out-of-bounds reads transparent', () => {
    const src = new Bitmap(2, 2, BLACK)
    const out = extractRegion(src, { x: 1, y: 1, width: 3, height: 3 })
    expect(out.get(2, 2)).toEqual(rgba(0, 0, 0, 0))
    expect(out.get(0, 0)).toEqual(BLACK)
  })
})

describe('flip and rotate', () => {
  const A = rgba(255, 0, 0)
  const B = rgba(0, 255, 0)
  const C = rgba(0, 0, 255)
  const D = rgba(255, 255, 0)

  function source(): Bitmap {
    const bitmap = new Bitmap(2, 2)
    bitmap.set(0, 0, A)
    bitmap.set(1, 0, B)
    bitmap.set(0, 1, C)
    bitmap.set(1, 1, D)
    return bitmap
  }

  function assertUnchanged(bitmap: Bitmap): void {
    expect(bitmap.width).toBe(2)
    expect(bitmap.height).toBe(2)
    expect(bitmap.get(0, 0)).toEqual(A)
    expect(bitmap.get(1, 0)).toEqual(B)
    expect(bitmap.get(0, 1)).toEqual(C)
    expect(bitmap.get(1, 1)).toEqual(D)
  }

  it('flips horizontally', () => {
    const src = source()
    const out = flipHorizontal(src)
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(out.get(0, 0)).toEqual(B)
    expect(out.get(1, 0)).toEqual(A)
    expect(out.get(0, 1)).toEqual(D)
    expect(out.get(1, 1)).toEqual(C)
    assertUnchanged(src)
  })

  it('flips vertically', () => {
    const src = source()
    const out = flipVertical(src)
    expect(out.get(0, 0)).toEqual(C)
    expect(out.get(1, 0)).toEqual(D)
    expect(out.get(0, 1)).toEqual(A)
    expect(out.get(1, 1)).toEqual(B)
    assertUnchanged(src)
  })

  it('rotates 90 degrees clockwise', () => {
    const src = source()
    const out = rotate90(src)
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(out.get(0, 0)).toEqual(C)
    expect(out.get(1, 0)).toEqual(A)
    expect(out.get(0, 1)).toEqual(D)
    expect(out.get(1, 1)).toEqual(B)
    assertUnchanged(src)
  })

  it('rotates 180 degrees', () => {
    const src = source()
    const out = rotate180(src)
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(out.get(0, 0)).toEqual(D)
    expect(out.get(1, 0)).toEqual(C)
    expect(out.get(0, 1)).toEqual(B)
    expect(out.get(1, 1)).toEqual(A)
    assertUnchanged(src)
  })

  it('rotates 270 degrees clockwise', () => {
    const src = source()
    const out = rotate270(src)
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(out.get(0, 0)).toEqual(B)
    expect(out.get(1, 0)).toEqual(D)
    expect(out.get(0, 1)).toEqual(A)
    expect(out.get(1, 1)).toEqual(C)
    assertUnchanged(src)
  })

  it('swaps dimensions for quarter turns on a non-square bitmap', () => {
    const src = new Bitmap(3, 1)
    src.set(0, 0, A)
    src.set(1, 0, B)
    src.set(2, 0, C)
    const cw = rotate90(src)
    expect(cw.width).toBe(1)
    expect(cw.height).toBe(3)
    expect(cw.get(0, 0)).toEqual(A)
    expect(cw.get(0, 1)).toEqual(B)
    expect(cw.get(0, 2)).toEqual(C)
    const ccw = rotate270(src)
    expect(ccw.width).toBe(1)
    expect(ccw.height).toBe(3)
    expect(ccw.get(0, 0)).toEqual(C)
    expect(ccw.get(0, 1)).toEqual(B)
    expect(ccw.get(0, 2)).toEqual(A)
  })
})

describe('rotateBy', () => {
  function sample(): Bitmap {
    const src = new Bitmap(3, 2, WHITE)
    src.set(0, 0, BLACK)
    src.set(2, 1, RED_OPAQUE)
    return src
  }

  it('matches the exact quarter turns', () => {
    expect(rotateBy(sample(), 90).data).toEqual(rotate90(sample()).data)
    expect(rotateBy(sample(), -90).data).toEqual(rotate270(sample()).data)
    expect(rotateBy(sample(), 180).data).toEqual(rotate180(sample()).data)
    expect(rotateBy(sample(), 360).data).toEqual(sample().data)
  })

  it('grows to the bounding box of the rotated image', () => {
    expect(rotatedSize(10, 10, 45)).toEqual({ width: 15, height: 15 })
    expect(rotatedSize(10, 4, 0)).toEqual({ width: 10, height: 4 })
    expect(rotatedSize(10, 4, 90)).toEqual({ width: 4, height: 10 })
    const out = rotateBy(new Bitmap(10, 10, BLACK), 45)
    expect(out.width).toBe(15)
    expect(out.height).toBe(15)
  })

  it('keeps the centre and fills uncovered corners with the given colour', () => {
    const out = rotateBy(new Bitmap(10, 10, BLACK), 45, WHITE)
    expect(out.get(7, 7)).toEqual(BLACK)
    expect(out.get(0, 0)).toEqual(WHITE)
  })

  it('leaves uncovered corners transparent without a fill', () => {
    const out = rotateBy(new Bitmap(10, 10, BLACK), 30)
    expect(out.get(0, 0).a).toBe(0)
    expect(out.get(Math.floor(out.width / 2), Math.floor(out.height / 2))).toEqual(BLACK)
  })
})

describe('fillPolygon', () => {
  it('fills a square region by pixel centres', () => {
    const bitmap = new Bitmap(10, 10)
    fillPolygon(bitmap, [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 5 }], BLACK)
    expect(countColor(bitmap)).toBe(12)
    expect(bitmap.get(2, 2)).toEqual(BLACK)
    expect(bitmap.get(5, 4)).toEqual(BLACK)
    expect(bitmap.get(6, 4).a).toBe(0)
    expect(bitmap.get(5, 5).a).toBe(0)
  })

  it('fills a triangle and leaves the corner outside empty', () => {
    const bitmap = new Bitmap(20, 20)
    fillPolygon(bitmap, [{ x: 10, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], BLACK)
    expect(bitmap.get(10, 10)).toEqual(BLACK)
    expect(bitmap.get(0, 0).a).toBe(0)
    expect(bitmap.get(19, 0).a).toBe(0)
    expect(bitmap.get(10, 19)).toEqual(BLACK)
  })

  it('uses the even-odd rule for self-intersecting polygons', () => {
    const bitmap = new Bitmap(20, 20)
    // Two overlapping squares traced as one path: the overlap is a hole.
    fillPolygon(
      bitmap,
      [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }, { x: 5, y: 5 },
        { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }, { x: 5, y: 10 }, { x: 0, y: 10 },
      ],
      BLACK,
    )
    expect(bitmap.get(2, 2)).toEqual(BLACK)
    expect(bitmap.get(12, 12)).toEqual(BLACK)
    expect(bitmap.get(7, 7).a).toBe(0)
  })

  it('ignores degenerate polygons and clips to the bitmap', () => {
    const bitmap = new Bitmap(5, 5)
    fillPolygon(bitmap, [], BLACK)
    fillPolygon(bitmap, [{ x: 1, y: 1 }, { x: 3, y: 1 }], BLACK)
    expect(countColor(bitmap)).toBe(0)
    fillPolygon(bitmap, [{ x: -10, y: -10 }, { x: 100, y: -10 }, { x: 100, y: 100 }, { x: -10, y: 100 }], BLACK)
    expect(countColor(bitmap)).toBe(25)
  })
})

describe('stamp size 2', () => {
  it('paints a 2×2 block with the round brush', () => {
    const bitmap = new Bitmap(6, 6, WHITE)
    stamp(bitmap, 2, 2, 2, BLACK, 'round')
    expect(countColor(bitmap)).toBe(4)
  })
})

describe('invertColors', () => {
  it('inverts the RGB channels and keeps the dimensions', () => {
    const source = new Bitmap(2, 1, WHITE)
    source.set(1, 0, BLACK)
    const result = invertColors(source)
    expect(result.width).toBe(2)
    expect(result.height).toBe(1)
    expect(result.get(0, 0)).toEqual(BLACK)
    expect(result.get(1, 0)).toEqual(WHITE)
  })

  it('keeps the alpha channel', () => {
    const source = new Bitmap(1, 1, { r: 10, g: 20, b: 30, a: 40 })
    expect(invertColors(source).get(0, 0)).toEqual({ r: 245, g: 235, b: 225, a: 40 })
  })
})
