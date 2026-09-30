import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, rgba } from './color'
import type { Rgba } from './color'
import { normalizeRect } from './geometry'
import type { Point } from './geometry'
import { drawEllipse, drawRect } from './raster'
import { SHAPES, renderShape, shapeById, shapeIconPath, shapePolygon } from './shapes'
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

/** A point known to be inside each closed drag shape, and box corners known to be outside. */
const CLOSED_DRAG: Record<string, { inside: Point; outside: Point[] }> = {
  rectangle: { inside: { x: 20, y: 20 }, outside: [] },
  'rounded-rectangle': { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  ellipse: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  triangle: { inside: { x: 20, y: 25 }, outside: [TL, TR] },
  'right-triangle': { inside: { x: 10, y: 28 }, outside: [TR] },
  diamond: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  pentagon: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  heptagon: { inside: { x: 20, y: 20 }, outside: [TL, TR, BL, BR] },
  'arrow-left': { inside: { x: 20, y: 20 }, outside: [TL, BL] },
  'arrow-right': { inside: { x: 20, y: 20 }, outside: [TR, BR] },
  'arrow-up': { inside: { x: 20, y: 20 }, outside: [TL, TR] },
  'arrow-down': { inside: { x: 20, y: 20 }, outside: [BL, BR] },
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
      expect(['drag', 'polyline', 'freehand']).toContain(shape.interaction)
      expect(shapeById(shape.id)).toBe(shape)
    }
  })

  it('covers every closed drag shape in these tests', () => {
    const closedDrag = SHAPES.filter((s) => s.closed && s.interaction === 'drag').map((s) => s.id)
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
      const a = draw(kind, BOTH)
      const b = draw(kind, BOTH, [END, START])
      expect(b.data).toEqual(a.data)
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

  it('points the arrows in the named direction', () => {
    const right = draw('arrow-right', BOTH)
    expect(painted(right, 34, 20)).toBe(true)
    expect(painted(right, 34, 8)).toBe(false)
    expect(painted(right, 34, 31)).toBe(false)
    expect(painted(right, 5, 8)).toBe(false)
    expect(painted(right, 5, 20)).toBe(true)

    const left = draw('arrow-left', BOTH)
    expect(painted(left, 5, 20)).toBe(true)
    expect(painted(left, 5, 8)).toBe(false)
    expect(painted(left, 5, 31)).toBe(false)
    expect(painted(left, 34, 20)).toBe(true)

    const up = draw('arrow-up', BOTH)
    expect(painted(up, 20, 5)).toBe(true)
    expect(painted(up, 8, 5)).toBe(false)
    expect(painted(up, 31, 5)).toBe(false)
    expect(painted(up, 8, 34)).toBe(false)
    expect(painted(up, 20, 34)).toBe(true)

    const down = draw('arrow-down', BOTH)
    expect(painted(down, 20, 34)).toBe(true)
    expect(painted(down, 8, 34)).toBe(false)
    expect(painted(down, 31, 34)).toBe(false)
    expect(painted(down, 20, 5)).toBe(true)
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

  it('draws a line between start and end', () => {
    const bitmap = draw('line', BOTH, [{ x: 5, y: 5 }, { x: 30, y: 30 }])
    expect(is(bitmap, 17, 17, BLACK)).toBe(true)
    expect(painted(bitmap, 25, 10)).toBe(false)
  })

  it('polyline draws an open path and never fills', () => {
    const bitmap = draw('polyline', BOTH, path)
    expect(is(bitmap, 17, 5, BLACK)).toBe(true)
    expect(is(bitmap, 30, 17, BLACK)).toBe(true)
    expect(painted(bitmap, 17, 17)).toBe(false)
    expect(painted(bitmap, 25, 10)).toBe(false)
  })

  it('freeform closes the path and fills the interior', () => {
    const bitmap = draw('freeform', BOTH, path)
    expect(is(bitmap, 17, 17, BLACK)).toBe(true)
    expect(is(bitmap, 25, 10, RED)).toBe(true)
    expect(painted(bitmap, 10, 25)).toBe(false)
  })

  it('freeform outline only leaves the interior empty', () => {
    const bitmap = draw('freeform', OUTLINE_ONLY, path)
    expect(is(bitmap, 17, 17, BLACK)).toBe(true)
    expect(painted(bitmap, 25, 10)).toBe(false)
  })

  it('handles empty and single point input', () => {
    const bitmap = new Bitmap(40, 40)
    for (const kind of ['line', 'polyline', 'freeform'] as ShapeKind[]) {
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

  it('returns no polygon for open and freehand shapes', () => {
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

  it('draws distinct icons', () => {
    const paths = SHAPES.map((shape) => shapeIconPath(shape.id))
    expect(new Set(paths).size).toBe(SHAPES.length)
  })
})

describe('500 px outlines', () => {
  it('renders every shape with a 500 px stroke in reasonable time', () => {
    const started = performance.now()
    for (const shape of SHAPES) {
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
