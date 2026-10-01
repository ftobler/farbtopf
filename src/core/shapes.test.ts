import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, rgba } from './color'
import type { Rgba } from './color'
import { normalizeRect } from './geometry'
import type { Point } from './geometry'
import { drawEllipse, drawRect } from './raster'
import { SHAPES, callout, renderShape, shapeById, shapeIconPath, shapePolygon } from './shapes'
import type { ShapeKind, ShapeStyle } from './shapes'

const RED = rgba(255, 0, 0)
const START: Point = { x: 5, y: 5 }
const END: Point = { x: 34, y: 34 }

const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const OUTLINE_ONLY: ShapeStyle = { width: 1, stroke: BLACK, fill: null }
const BOTH: ShapeStyle = { width: 1, stroke: BLACK, fill: RED }

function draw(kind: ShapeKind, style: ShapeStyle, points: Point[] = [START, END]): Bitmap {
  const bitmap = new Bitmap(40, 40)
  renderShape(bitmap, kind, points, style)
  return bitmap
}

function painted(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.get(x, y).a !== 0
}

function is(bitmap: Bitmap, x: number, y: number, color: Rgba): boolean {
  const p = bitmap.get(x, y)
  return p.r === color.r && p.g === color.g && p.b === color.b && p.a === color.a
}

function paintedCount(bitmap: Bitmap): number {
  let count = 0
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) if (painted(bitmap, x, y)) count += 1
  }
  return count
}

const TL: Point = { x: 5, y: 5 }
const TR: Point = { x: 34, y: 5 }
const BL: Point = { x: 5, y: 34 }
const BR: Point = { x: 34, y: 34 }

/** The line-arrows render through the tweak engine, so core tests skip them. */
const ARROW_KINDS = new Set<ShapeKind>(['arrow', 'arrow-double', 'arrow-axis'])

/** A point known to be inside each closed drag shape, and box corners known to be outside. */
const CLOSED_DRAG: Record<string, { inside: Point; outside: Point[] }> = {
  rectangle: { inside: { x: 20, y: 20 }, outside: [] },
  'rounded-rectangle': { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  ellipse: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  potatoid: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  triangle: { inside: { x: 20, y: 25 }, outside: [TL, TR] },
  'right-triangle': { inside: { x: 10, y: 28 }, outside: [TR] },
  diamond: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  pentagon: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  heptagon: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  'star-4': { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  'star-5': { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  'star-6': { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  'callout-rectangle': { inside: { x: 20, y: 15 }, outside: [BR] },
  'callout-rounded-rectangle': { inside: { x: 20, y: 15 }, outside: [TL, TR, BR] },
  'callout-oval': { inside: { x: 20, y: 15 }, outside: [TL, TR, BR] },
}

describe('SHAPES', () => {
  it('lists 21 unique shapes, each with an interaction', () => {
    expect(SHAPES).toHaveLength(21)
    expect(new Set(SHAPES.map((shape) => shape.id)).size).toBe(21)
    for (const shape of SHAPES) {
      expect(['drag', 'polyline', 'curve']).toContain(shape.interaction)
      expect(shapeById(shape.id)).toBe(shape)
    }
  })

  it('covers every closed drag shape in these tests', () => {
    // The three line-arrows render through the tweak engine, so they are covered there.
    const closedDrag = SHAPES.filter(
      (s) => s.closed && s.interaction === 'drag' && !ARROW_KINDS.has(s.id),
    ).map((s) => s.id)
    expect(closedDrag.sort()).toEqual(Object.keys(CLOSED_DRAG).sort())
  })
})

describe('renderShape closed drag shapes', () => {
  for (const [kind, { inside, outside }] of Object.entries(CLOSED_DRAG)) {
    const shape = kind as ShapeKind

    it(`${kind}: fills the interior and leaves outside corners empty`, () => {
      const bitmap = draw(shape, FILL_ONLY)
      expect(is(bitmap, inside.x, inside.y, RED)).toBe(true)
      for (const corner of outside) expect(painted(bitmap, corner.x, corner.y)).toBe(false)
    })

    it(`${kind}: outline only leaves the interior untouched`, () => {
      const bitmap = draw(shape, OUTLINE_ONLY)
      expect(painted(bitmap, inside.x, inside.y)).toBe(false)
      expect(paintedCount(bitmap)).toBeGreaterThan(20)
      for (const corner of outside) expect(painted(bitmap, corner.x, corner.y)).toBe(false)
    })

    it(`${kind}: draws the outline over the fill`, () => {
      const bitmap = draw(shape, BOTH)
      expect(is(bitmap, inside.x, inside.y, RED)).toBe(true)
      let black = 0
      for (let y = 0; y < 40; y += 1) for (let x = 0; x < 40; x += 1) if (is(bitmap, x, y, BLACK)) black += 1
      expect(black).toBeGreaterThan(20)
    })

    for (const width of [4, 5]) {
      it(`${kind}: keeps a ${width}px outline inside the dragged box`, () => {
        const bitmap = draw(shape, { width, stroke: BLACK, fill: RED })
        for (let y = 0; y < 40; y += 1) {
          for (let x = 0; x < 40; x += 1) {
            if (x >= 5 && x <= 34 && y >= 5 && y <= 34) continue
            expect(painted(bitmap, x, y), `${x},${y}`).toBe(false)
          }
        }
      })
    }

    it(`${kind}: does not throw on degenerate boxes`, () => {
      const bitmap = new Bitmap(40, 40)
      expect(() => renderShape(bitmap, shape, [START, START], BOTH)).not.toThrow()
      expect(() => renderShape(bitmap, shape, [START, { x: 30, y: 5 }], BOTH)).not.toThrow()
      expect(() => renderShape(bitmap, shape, [START, { x: 5, y: 30 }], { ...BOTH, width: 7 })).not.toThrow()
    })
  }

  it('is independent of the drag direction', () => {
    for (const kind of Object.keys(CLOSED_DRAG) as ShapeKind[]) {
      if (kind === 'right-triangle') continue
      const a = draw(kind, BOTH)
      const b = draw(kind, BOTH, [END, START])
      expect(b.data).toEqual(a.data)
    }
  })

  it('orients the right triangle so the right angle follows the drag', () => {
    const cases: { from: Point; to: Point; inside: Point; outside: Point }[] = [
      { from: TL, to: BR, inside: { x: 10, y: 30 }, outside: { x: 30, y: 10 } },
      { from: TR, to: BL, inside: { x: 30, y: 30 }, outside: { x: 10, y: 10 } },
      { from: BL, to: TR, inside: { x: 10, y: 10 }, outside: { x: 30, y: 30 } },
      { from: BR, to: TL, inside: { x: 30, y: 10 }, outside: { x: 10, y: 30 } },
    ]
    for (const { from, to, inside, outside } of cases) {
      const label = `${from.x},${from.y}->${to.x},${to.y}`
      const bitmap = draw('right-triangle', FILL_ONLY, [from, to])
      expect(is(bitmap, inside.x, inside.y, RED), label).toBe(true)
      expect(painted(bitmap, outside.x, outside.y), label).toBe(false)
    }
  })

  it('draws the rectangle exactly like drawRect', () => {
    const style: ShapeStyle = { width: 3, stroke: BLACK, fill: RED }
    const actual = draw('rectangle', style)
    const expected = new Bitmap(40, 40)
    const rect = normalizeRect(START, END)
    drawRect(expected, rect, 1, RED, true)
    drawRect(expected, rect, 3, BLACK, false)
    expect(actual.data).toEqual(expected.data)
  })

  it('draws the ellipse exactly like drawEllipse', () => {
    const style: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }
    const actual = draw('ellipse', style)
    const expected = new Bitmap(40, 40)
    const rect = normalizeRect(START, END)
    drawEllipse(expected, rect, 1, RED, true)
    drawEllipse(expected, rect, 2, BLACK, false)
    expect(actual.data).toEqual(expected.data)
  })

  it('draws callout tails reaching the bottom-left of the box', () => {
    for (const kind of ['callout-rectangle', 'callout-rounded-rectangle', 'callout-oval'] as ShapeKind[]) {
      const bitmap = draw(kind, BOTH)
      let tail = false
      for (let x = 5; x < 20; x += 1) if (painted(bitmap, x, 34) || painted(bitmap, x, 33)) tail = true
      expect(tail, kind).toBe(true)
      for (let x = 20; x < 40; x += 1) expect(painted(bitmap, x, 33), `${kind} ${x}`).toBe(false)
      expect(painted(bitmap, 34, 34)).toBe(false)
    }
  })

  it('curves the oval callout tail and keeps the rectangular ones straight', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 }
    const tip = { x: 100, y: 100 }
    const outsideBody = (points: Point[]) => points.filter((p) => p.y > 78.01).length
    // A straight tail adds only its tip below the body; a curved one adds samples along both sides.
    expect(outsideBody(callout('callout-rectangle', box, tip))).toBe(1)
    expect(outsideBody(callout('callout-oval', box, tip))).toBeGreaterThan(5)
  })

  it('draws callouts as one outline without a line across the tail base', () => {
    const polygon = shapePolygon('callout-rectangle', { x: 0, y: 0, width: 100, height: 100 })
    const bodyBottom = Math.max(...polygon.filter((p) => p.y < 100).map((p) => p.y))
    const bitmap = draw('callout-rectangle', OUTLINE_ONLY, [{ x: 0, y: 0 }, { x: 39, y: 39 }])
    const row = Math.round((bodyBottom / 100) * 39)
    const insideTail = polygon.filter((p) => p.y === bodyBottom).map((p) => p.x).sort((a, b) => a - b)
    // Between the two tail base points on the body's bottom edge nothing is stroked.
    const mid = Math.round(((insideTail[1] + insideTail[2]) / 2 / 100) * 39)
    expect(painted(bitmap, mid, row)).toBe(false)
  })
})

describe('renderShape line, polyline and freeform', () => {
  const path: Point[] = [{ x: 5, y: 5 }, { x: 30, y: 5 }, { x: 30, y: 30 }]
  const curve: Point[] = [{ x: 5, y: 5 }, { x: 30, y: 5 }, { x: 5, y: 35 }, { x: 35, y: 35 }]

  it('draws a line between start and end', () => {
    const bitmap = draw('line', BOTH, [{ x: 5, y: 5 }, { x: 30, y: 30 }])
    expect(is(bitmap, 17, 17, BLACK)).toBe(true)
    expect(painted(bitmap, 25, 10)).toBe(false)
  })

  it('freeform draws an open click path and never fills', () => {
    const bitmap = draw('freeform', BOTH, path)
    expect(is(bitmap, 17, 5, BLACK)).toBe(true)
    expect(is(bitmap, 30, 17, BLACK)).toBe(true)
    expect(painted(bitmap, 17, 17)).toBe(false)
    expect(painted(bitmap, 25, 10)).toBe(false)
  })

  it('polyline strokes a cubic bezier through its four control points', () => {
    const bitmap = draw('polyline', BOTH, curve)
    expect(painted(bitmap, 18, 20)).toBe(true)
    expect(painted(bitmap, 5, 35)).toBe(false)
  })

  it('bending a polyline control point changes the curve', () => {
    const straight = draw('polyline', BOTH, [
      { x: 5, y: 5 },
      { x: 15, y: 15 },
      { x: 25, y: 25 },
      { x: 35, y: 35 },
    ])
    const bent = draw('polyline', BOTH, curve)
    expect(bent.data).not.toEqual(straight.data)
  })

  it('handles empty and single point input', () => {
    const bitmap = new Bitmap(40, 40)
    for (const kind of ['line', 'freeform', 'polyline'] as ShapeKind[]) {
      expect(() => renderShape(bitmap, kind, [], BOTH)).not.toThrow()
      expect(() => renderShape(bitmap, kind, [START], BOTH)).not.toThrow()
    }
  })
})

describe('shapePolygon', () => {
  it('stays inside the given box', () => {
    const box = { x: 10, y: 20, width: 50, height: 30 }
    for (const kind of Object.keys(CLOSED_DRAG) as ShapeKind[]) {
      const polygon = shapePolygon(kind, box)
      expect(polygon.length, kind).toBeGreaterThanOrEqual(3)
      for (const p of polygon) {
        expect(p.x).toBeGreaterThanOrEqual(10 - 1e-9)
        expect(p.x).toBeLessThanOrEqual(60 + 1e-9)
        expect(p.y).toBeGreaterThanOrEqual(20 - 1e-9)
        expect(p.y).toBeLessThanOrEqual(50 + 1e-9)
      }
    }
  })

  it('fills the box extents for stretched regular shapes', () => {
    const box = { x: 0, y: 0, width: 80, height: 40 }
    for (const kind of ['pentagon', 'heptagon', 'star-4', 'star-5', 'star-6'] as ShapeKind[]) {
      const polygon = shapePolygon(kind, box)
      expect(Math.min(...polygon.map((p) => p.x))).toBeCloseTo(0)
      expect(Math.max(...polygon.map((p) => p.x))).toBeCloseTo(80)
      expect(Math.min(...polygon.map((p) => p.y))).toBeCloseTo(0)
      expect(Math.max(...polygon.map((p) => p.y))).toBeCloseTo(40)
    }
  })

  it('points the first vertex of regular shapes up', () => {
    for (const kind of ['pentagon', 'heptagon', 'star-4', 'star-5', 'star-6'] as ShapeKind[]) {
      const polygon = shapePolygon(kind, { x: 0, y: 0, width: 100, height: 100 })
      expect(polygon[0].x).toBeCloseTo(50)
      expect(polygon[0].y).toBeCloseTo(0)
    }
  })

  it('returns no polygon for open shapes', () => {
    for (const kind of ['line', 'polyline', 'freeform'] as ShapeKind[]) {
      expect(shapePolygon(kind, { x: 0, y: 0, width: 10, height: 10 })).toEqual([])
    }
  })
})

describe('shapeIconPath', () => {
  it('returns a path for every shape, closed only for closed shapes', () => {
    for (const shape of SHAPES) {
      const path = shapeIconPath(shape.id)
      expect(path.length, shape.id).toBeGreaterThan(0)
      expect(path.startsWith('M')).toBe(true)
      expect(path.trim().endsWith('Z'), shape.id).toBe(shape.closed)
    }
  })

  it('keeps coordinates within the icon box', () => {
    for (const shape of SHAPES) {
      const numbers = shapeIconPath(shape.id, 32).match(/-?\d+(\.\d+)?/g) ?? []
      expect(numbers.length).toBeGreaterThan(0)
      for (const n of numbers) {
        expect(Number(n)).toBeGreaterThanOrEqual(0)
        expect(Number(n)).toBeLessThanOrEqual(32)
      }
    }
  })

  it('draws a clearly lumpy potatoid icon with several dents', () => {
    const numbers = (shapeIconPath('potatoid', 24).match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    const points: { x: number; y: number }[] = []
    for (let i = 0; i < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] })
    const n = points.length
    const turns = points.map((p, i) => {
      const a = points[(i + n - 1) % n]
      const b = points[(i + 1) % n]
      return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)
    })
    const main = Math.sign(turns.reduce((sum, t) => sum + t, 0))
    // Count the concave runs: stretches where the outline bends against its overall winding.
    let dents = 0
    for (let i = 0; i < n; i += 1) {
      const concave = Math.sign(turns[i]) === -main
      const prevConcave = Math.sign(turns[(i + n - 1) % n]) === -main
      if (concave && !prevConcave) dents += 1
    }
    expect(dents).toBeGreaterThanOrEqual(3)
  })

  it('draws distinct icons', () => {
    const paths = SHAPES.map((shape) => shapeIconPath(shape.id))
    expect(new Set(paths).size).toBe(SHAPES.length)
  })
})

describe('500 px outlines', () => {
  it('renders every shape with a 500 px stroke in reasonable time', () => {
    const started = performance.now()
    for (const shape of SHAPES) {
      if (ARROW_KINDS.has(shape.id)) continue
      const bitmap = new Bitmap(900, 900)
      const points =
        shape.interaction === 'drag'
          ? [{ x: 100, y: 100 }, { x: 800, y: 800 }]
          : [{ x: 100, y: 100 }, { x: 800, y: 200 }, { x: 500, y: 800 }, { x: 150, y: 600 }]
      renderShape(bitmap, shape.id, points, { width: 500, stroke: BLACK, fill: null })
      // Something thick was drawn: the stroke reaches well inside the box.
      let painted = 0
      for (let y = 0; y < 900; y += 10) {
        for (let x = 0; x < 900; x += 10) if (bitmap.get(x, y).a > 0) painted += 1
      }
      expect(painted, shape.id).toBeGreaterThan(1000)
    }
    expect(performance.now() - started).toBeLessThan(8000)
  })
})
