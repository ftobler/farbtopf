import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, WHITE, colorsEqual, rgba } from './color'
import type { Rgba } from './color'
import type { Point } from './geometry'
import {
  bezierPoints,
  blit,
  crop,
  drawBezier,
  drawEllipse,
  drawLine,
  drawPolyline,
  drawRect,
  ellipseSpans,
  extractRegion,
  fillPolygon,
  fitWithin,
  flipHorizontal,
  flipVertical,
  floodFill,
  invertColors,
  linePoints,
  linePointsBetween,
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
  it('covers exactly the union of stamps along the line', () => {
    // The fast span-based line must match stamping at every line pixel.
    const cases = [
      { from: { x: 3, y: 4 }, to: { x: 40, y: 17 }, size: 7 },
      { from: { x: 30, y: 2 }, to: { x: 5, y: 45 }, size: 12 },
      { from: { x: 10, y: 10 }, to: { x: 38, y: 38 }, size: 20 },
      { from: { x: 25, y: 25 }, to: { x: 25, y: 25 }, size: 9 },
      { from: { x: -5, y: 20 }, to: { x: 60, y: 22 }, size: 16 },
      { from: { x: 20, y: 5 }, to: { x: 21, y: 44 }, size: 2 },
    ]
    for (const shape of ['round', 'square'] as const) {
      for (const { from, to, size } of cases) {
        const fast = new Bitmap(50, 50)
        drawLine(fast, from, to, size, BLACK, shape)
        const naive = new Bitmap(50, 50)
        for (const p of linePointsBetween(from, to)) stamp(naive, p.x, p.y, size, BLACK, shape)
        expect(fast.data).toEqual(naive.data)
      }
    }
  })

  it('draws a 500 px stroke quickly and at full width', () => {
    const bitmap = new Bitmap(800, 800, WHITE)
    const started = performance.now()
    drawLine(bitmap, { x: 150, y: 400 }, { x: 650, y: 400 }, 500, BLACK, 'round')
    drawLine(bitmap, { x: 150, y: 150 }, { x: 650, y: 650 }, 500, BLACK, 'square')
    expect(performance.now() - started).toBeLessThan(1500)
    // The round line reaches 250 px above and below its centre line.
    expect(bitmap.get(400, 400 - 249)).toEqual(BLACK)
    expect(bitmap.get(400, 400 + 249)).toEqual(BLACK)
    expect(bitmap.get(400, 400 + 260)).toEqual(BLACK) // covered by the square diagonal
    expect(bitmap.get(0, 799)).toEqual(WHITE)
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

describe('bezierPoints', () => {
  const control: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 30, y: 20 },
    { x: 40, y: 0 },
  ]

  it('includes the exact endpoints', () => {
    const points = bezierPoints(control)
    expect(points[0]).toEqual(control[0])
    expect(points[points.length - 1]).toEqual(control[3])
  })

  it('samples t monotonically along a horizontal curve', () => {
    const flat: [Point, Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]
    const points = bezierPoints(flat, 12)
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].x).toBeGreaterThan(points[i - 1].x)
    }
  })

  it('keeps collinear control points collinear', () => {
    const line: [Point, Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 15, y: 15 },
    ]
    for (const p of bezierPoints(line, 8)) expect(p.x).toBeCloseTo(p.y)
  })

  it('uses more steps for longer curves', () => {
    const short: [Point, Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]
    const long: [Point, Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: -40 },
      { x: 150, y: 0 },
    ]
    expect(bezierPoints(long).length).toBeGreaterThan(bezierPoints(short).length)
  })
})

describe('drawBezier', () => {
  const control: [Point, Point, Point, Point] = [
    { x: 5, y: 5 },
    { x: 30, y: 5 },
    { x: 5, y: 35 },
    { x: 35, y: 35 },
  ]

  it('paints on the curve', () => {
    const bitmap = new Bitmap(40, 40)
    drawBezier(bitmap, control, 1, BLACK)
    expect(bitmap.get(18, 20)).toEqual(BLACK)
  })

  it('leaves a far-off pixel empty', () => {
    const bitmap = new Bitmap(40, 40)
    drawBezier(bitmap, control, 1, BLACK)
    expect(bitmap.get(5, 35).a).toBe(0)
  })

  it('bending a control point leaves the straight-line midpoint empty', () => {
    const straight: [Point, Point, Point, Point] = [
      { x: 5, y: 5 },
      { x: 15, y: 15 },
      { x: 25, y: 25 },
      { x: 35, y: 35 },
    ]
    const straightBitmap = new Bitmap(40, 40)
    drawBezier(straightBitmap, straight, 1, BLACK)
    expect(straightBitmap.get(20, 20)).toEqual(BLACK)

    const bentBitmap = new Bitmap(40, 40)
    drawBezier(bentBitmap, control, 1, BLACK)
    expect(bentBitmap.get(20, 20).a).toBe(0)
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

  it('recolors when the fill colour is within tolerance of the start but not equal', () => {
    const bitmap = new Bitmap(3, 3)
    bitmap.fill(rgba(100, 100, 100))
    const fill = rgba(108, 108, 108)
    const changed = floodFill(bitmap, { x: 1, y: 1 }, fill, 10)
    expect(changed).toBe(9)
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        expect(bitmap.get(x, y), `pixel ${x},${y}`).toEqual(fill)
      }
    }
  })

  it('terminates and fills each pixel once when the fill colour still matches the target within tolerance', () => {
    const bitmap = new Bitmap(8, 8)
    bitmap.fill(rgba(100, 100, 100))
    const fill = rgba(105, 105, 105)
    const changed = floodFill(bitmap, { x: 0, y: 0 }, fill, 20)
    expect(changed).toBe(64)
    expect(countColor(bitmap, fill)).toBe(64)
  })

  it('returns 0 when the start is outside the bitmap', () => {
    const bitmap = new Bitmap(4, 4, WHITE)
    expect(floodFill(bitmap, { x: -1, y: 0 }, BLACK)).toBe(0)
    expect(floodFill(bitmap, { x: 0, y: 4 }, BLACK)).toBe(0)
  })

  it('returns 0 when the start already matches the fill color', () => {
    const bitmap = new Bitmap(4, 4, BLACK)
    expect(floodFill(bitmap, { x: 2, y: 2 }, BLACK)).toBe(0)
  })

  it('returns 0 when the fill colour exactly matches the start even with tolerance', () => {
    const bitmap = new Bitmap(3, 3)
    bitmap.fill(rgba(100, 100, 100))
    expect(floodFill(bitmap, { x: 1, y: 1 }, rgba(100, 100, 100), 10)).toBe(0)
  })
})

describe('floodFill equivalence with reference fill', () => {
  function referenceFloodFill(
    bitmap: Bitmap,
    start: Point,
    color: Rgba,
    tolerance = 0,
  ): number {
    const sx = Math.floor(start.x)
    const sy = Math.floor(start.y)
    if (!bitmap.contains(sx, sy)) return 0
    const target = bitmap.get(sx, sy)
    if (colorsEqual(target, color, 0)) return 0
    const visited = new Uint8Array(bitmap.width * bitmap.height)
    const stack: Point[] = [{ x: sx, y: sy }]
    let changed = 0
    while (stack.length > 0) {
      const { x, y } = stack.pop() as Point
      if (!bitmap.contains(x, y)) continue
      const index = y * bitmap.width + x
      if (visited[index]) continue
      if (!colorsEqual(bitmap.get(x, y), target, tolerance)) continue
      visited[index] = 1
      bitmap.set(x, y, color)
      changed += 1
      stack.push(
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      )
    }
    return changed
  }

  function expectMatchesReference(
    build: (bitmap: Bitmap) => void,
    start: Point,
    color: Rgba,
    tolerance = 0,
  ): void {
    const expected = new Bitmap(20, 20, WHITE)
    build(expected)
    const actual = expected.clone()
    const expectedChanged = referenceFloodFill(expected, start, color, tolerance)
    const actualChanged = floodFill(actual, start, color, tolerance)
    expect(actualChanged).toBe(expectedChanged)
    expect(Array.from(actual.data)).toEqual(Array.from(expected.data))
  }

  const scenarios: Array<{ name: string; build: (bitmap: Bitmap) => void; start: Point }> = [
    {
      name: 'obstacle wall with a gap',
      build: (bitmap) => {
        for (let y = 0; y < 20; y += 1) {
          if (y < 8 || y > 12) bitmap.set(10, y, BLACK)
        }
      },
      start: { x: 2, y: 2 },
    },
    {
      name: 'enclosed hole and disconnected region',
      build: (bitmap) => {
        drawRect(bitmap, { x: 3, y: 3, width: 8, height: 8 }, 1, BLACK, false)
        drawRect(bitmap, { x: 14, y: 14, width: 4, height: 4 }, 1, BLACK, false)
      },
      start: { x: 5, y: 5 },
    },
    {
      name: 'diagonal boundary',
      build: (bitmap) => {
        for (let i = 0; i < 20; i += 1) bitmap.set(i, i, BLACK)
      },
      start: { x: 2, y: 10 },
    },
    {
      name: 'filled obstacles from a corner',
      build: (bitmap) => {
        for (let y = 4; y < 9; y += 1) {
          for (let x = 4; x < 16; x += 1) bitmap.set(x, y, rgba(0, 0, 0, 255))
        }
        bitmap.set(0, 19, BLACK)
      },
      start: { x: 19, y: 0 },
    },
  ]

  const fillColors = [RED_OPAQUE, BLACK, rgba(0, 128, 255)]

  for (const scenario of scenarios) {
    it(`matches the reference on ${scenario.name}`, () => {
      for (const color of fillColors) {
        expectMatchesReference(scenario.build, scenario.start, color)
      }
    })
  }

  it('matches the reference across tolerances on a gradient', () => {
    const build = (bitmap: Bitmap): void => {
      for (let y = 0; y < 20; y += 1) {
        for (let x = 0; x < 20; x += 1) {
          const value = 90 + ((x + y * 2) % 7) * 5
          bitmap.set(x, y, rgba(value, value, value, 255))
        }
      }
      for (let y = 0; y < 20; y += 1) bitmap.set(9, y, BLACK)
    }
    for (const tolerance of [0, 4, 12, 30]) {
      expectMatchesReference(build, { x: 0, y: 0 }, rgba(10, 20, 30), tolerance)
    }
  })

  it('matches the reference when the fill colour is within tolerance of the start', () => {
    const build = (bitmap: Bitmap): void => {
      bitmap.fill(rgba(100, 100, 100))
      for (let y = 0; y < 20; y += 1) bitmap.set(9, y, BLACK)
    }
    expectMatchesReference(build, { x: 0, y: 0 }, rgba(108, 108, 108), 10)
  })
})

describe('floodFill large areas', () => {
  it('fills a large empty canvas completely within a generous budget', () => {
    const size = 2048
    const bitmap = new Bitmap(size, size, WHITE)
    const start = performance.now()
    const changed = floodFill(bitmap, { x: 0, y: 0 }, BLACK)
    const elapsed = performance.now() - start

    expect(changed).toBe(size * size)
    expect(elapsed).toBeLessThan(4000)
    for (let i = 0; i < bitmap.data.length; i += 4) {
      if (bitmap.data[i] !== 0 || bitmap.data[i + 3] !== 255) {
        throw new Error(`pixel at byte ${i} was not filled: ${bitmap.data[i]}`)
      }
    }
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

describe('fitWithin', () => {
  it('scales a bitmap down proportionally so its longer side fits the limit', () => {
    const out = fitWithin(new Bitmap(100, 50, BLACK), 40)
    expect(out.width).toBe(40)
    expect(out.height).toBe(20)
  })

  it('fits a portrait bitmap by its longer side', () => {
    const out = fitWithin(new Bitmap(50, 100, BLACK), 40)
    expect(out.width).toBe(20)
    expect(out.height).toBe(40)
  })

  it('returns the bitmap unchanged when it already fits', () => {
    const source = new Bitmap(30, 20, BLACK)
    expect(fitWithin(source, 40)).toBe(source)
  })

  it('does not upscale a bitmap smaller than the limit', () => {
    const source = new Bitmap(10, 10, BLACK)
    expect(fitWithin(source, 40)).toBe(source)
  })

  it('keeps both sides at least one pixel', () => {
    const out = fitWithin(new Bitmap(100, 1, BLACK), 10)
    expect(out.width).toBe(10)
    expect(out.height).toBe(1)
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
