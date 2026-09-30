import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { renderShape } from '../shapes'
import { polygonFamily } from './polygons'

const RED = rgba(255, 0, 0)
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }

const SQUARE_START: Point = { x: 5, y: 5 }
const SQUARE_END: Point = { x: 34, y: 34 }
const WIDE_START: Point = { x: 5, y: 5 }
const WIDE_END: Point = { x: 44, y: 24 }

const RIGHT_TRIANGLE_BOXES: readonly [Point, Point][] = [
  [{ x: 5, y: 5 }, { x: 44, y: 24 }],
  [{ x: 44, y: 5 }, { x: 5, y: 24 }],
  [{ x: 5, y: 24 }, { x: 44, y: 5 }],
  [{ x: 44, y: 24 }, { x: 5, y: 5 }],
]

function parity(kind: ShapeKind, start: Point, end: Point, style: ShapeStyle): void {
  const actual = new Bitmap(60, 60)
  polygonFamily.render(actual, kind, polygonFamily.insert(kind, start, end), style)
  const expected = new Bitmap(60, 60)
  renderShape(expected, kind, [start, end], style)
  expect(actual.data).toEqual(expected.data)
}

describe('polygonFamily insert and handles', () => {
  it('inserts the three triangle vertices mapped into the box', () => {
    const points = polygonFamily.insert('triangle', SQUARE_START, SQUARE_END)
    expect(points).toEqual([
      { x: 20, y: 5 },
      { x: 35, y: 35 },
      { x: 5, y: 35 },
    ])
  })

  it('inserts the four diamond vertices mapped into the box', () => {
    const points = polygonFamily.insert('diamond', SQUARE_START, SQUARE_END)
    expect(points).toEqual([
      { x: 20, y: 5 },
      { x: 35, y: 20 },
      { x: 20, y: 35 },
      { x: 5, y: 20 },
    ])
  })

  it('exposes v0..v2 for the triangle and v0..v3 for the diamond', () => {
    expect(polygonFamily.handles('triangle', polygonFamily.insert('triangle', SQUARE_START, SQUARE_END)).map((h) => h.id)).toEqual(['v0', 'v1', 'v2'])
    expect(polygonFamily.handles('diamond', polygonFamily.insert('diamond', SQUARE_START, SQUARE_END)).map((h) => h.id)).toEqual(['v0', 'v1', 'v2', 'v3'])
  })

  it('right-triangle v0 is the right-angle corner', () => {
    const topLeft = polygonFamily.insert('right-triangle', { x: 5, y: 5 }, { x: 44, y: 24 })
    expect(topLeft[0]).toEqual({ x: 5, y: 5 })

    const bottomRight = polygonFamily.insert('right-triangle', { x: 44, y: 24 }, { x: 5, y: 5 })
    expect(bottomRight[0]).toEqual({ x: 45, y: 25 })
  })

  it('right-triangle exposes v0..v2', () => {
    const points = polygonFamily.insert('right-triangle', { x: 5, y: 5 }, { x: 44, y: 24 })
    expect(polygonFamily.handles('right-triangle', points).map((h) => h.id)).toEqual(['v0', 'v1', 'v2'])
  })
})

describe('polygonFamily vertex dragging', () => {
  it('moving v0 replaces only that vertex', () => {
    const points = polygonFamily.insert('triangle', SQUARE_START, SQUARE_END)
    const moved = polygonFamily.move('triangle', points, 'v0', { x: 20, y: 0 })
    expect(moved).not.toBeNull()
    expect(moved![0]).toEqual({ x: 20, y: 0 })
    expect(moved![1]).toEqual(points[1])
    expect(moved![2]).toEqual(points[2])
  })

  it('moving v0 changes the rendered pixels', () => {
    const points = polygonFamily.insert('triangle', SQUARE_START, SQUARE_END)
    const moved = polygonFamily.move('triangle', points, 'v0', { x: 20, y: 0 })
    expect(moved).not.toBeNull()

    const before = new Bitmap(60, 60)
    polygonFamily.render(before, 'triangle', points, FILL_ONLY)
    const after = new Bitmap(60, 60)
    polygonFamily.render(after, 'triangle', moved!, FILL_ONLY)

    expect(after.data).not.toEqual(before.data)
  })

  it('returns null for an unknown handle', () => {
    const triangle = polygonFamily.insert('triangle', SQUARE_START, SQUARE_END)
    expect(polygonFamily.move('triangle', triangle, 'bogus', { x: 1, y: 1 })).toBeNull()
    expect(polygonFamily.move('triangle', triangle, 'v9', { x: 1, y: 1 })).toBeNull()
    const diamond = polygonFamily.insert('diamond', SQUARE_START, SQUARE_END)
    expect(polygonFamily.move('diamond', diamond, 'v4', { x: 1, y: 1 })).toBeNull()
  })
})

describe('polygonFamily render parity', () => {
  it('triangle renders exactly like renderShape for square and non-square boxes', () => {
    parity('triangle', SQUARE_START, SQUARE_END, BOTH)
    parity('triangle', WIDE_START, WIDE_END, BOTH)
  })

  it('diamond renders exactly like renderShape for square and non-square boxes', () => {
    parity('diamond', SQUARE_START, SQUARE_END, BOTH)
    parity('diamond', WIDE_START, WIDE_END, BOTH)
  })

  it('triangle matches renderShape with a fill only', () => {
    parity('triangle', SQUARE_START, SQUARE_END, FILL_ONLY)
    parity('triangle', WIDE_START, WIDE_END, FILL_ONLY)
  })

  it('right-triangle matches renderShape from each of the four start corners', () => {
    for (const [start, end] of RIGHT_TRIANGLE_BOXES) {
      parity('right-triangle', start, end, BOTH)
      parity('right-triangle', start, end, FILL_ONLY)
    }
  })
})
