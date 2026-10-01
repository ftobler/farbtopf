import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import { normalizeRect } from '../geometry'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { fillPolygon } from '../raster'
import { callout, fillBox, outlineBox } from '../shapes'
import { calloutFamily } from './callouts'

const RED = rgba(255, 0, 0)
const KINDS: ShapeKind[] = ['callout-rectangle', 'callout-rounded-rectangle', 'callout-oval']
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }

const SQUARE: [Point, Point] = [
  { x: 5, y: 5 },
  { x: 34, y: 34 },
]

function painted(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.get(x, y).a !== 0
}

function renderWithTip(kind: ShapeKind, tip: Point, style: ShapeStyle = BOTH): Bitmap {
  const points = calloutFamily.insert(kind, SQUARE[0], SQUARE[1])
  const moved = calloutFamily.move(kind, points, 'tail', tip)
  const bitmap = new Bitmap(60, 60)
  calloutFamily.render(bitmap, kind, moved ?? points, style)
  return bitmap
}

function renderDefault(kind: ShapeKind, style: ShapeStyle = BOTH): Bitmap {
  const points = calloutFamily.insert(kind, SQUARE[0], SQUARE[1])
  const bitmap = new Bitmap(60, 60)
  calloutFamily.render(bitmap, kind, points, style)
  return bitmap
}

describe('calloutFamily insert', () => {
  it('adds the default tail tip as a third anchor', () => {
    const points = calloutFamily.insert('callout-rectangle', SQUARE[0], SQUARE[1])
    expect(points).toHaveLength(3)
    const box = normalizeRect(SQUARE[0], SQUARE[1])
    expect(points[2]).toEqual({ x: box.x + 0.15 * box.width, y: box.y + box.height })
  })
})

describe('calloutFamily handles', () => {
  it('exposes the eight box handles plus the tail', () => {
    const points = calloutFamily.insert('callout-oval', SQUARE[0], SQUARE[1])
    expect(calloutFamily.handles('callout-oval', points).map((h) => h.id)).toEqual([
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'tail',
    ])
  })

  it('adds a radius handle to the rounded callout only', () => {
    const rounded = calloutFamily.insert('callout-rounded-rectangle', SQUARE[0], SQUARE[1])
    expect(calloutFamily.handles('callout-rounded-rectangle', rounded).map((h) => h.id)).toEqual([
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'tail',
      'radius',
    ])
    for (const kind of ['callout-rectangle', 'callout-oval'] as ShapeKind[]) {
      const points = calloutFamily.insert(kind, SQUARE[0], SQUARE[1])
      expect(calloutFamily.handles(kind, points).some((h) => h.id === 'radius'), kind).toBe(false)
    }
  })

  it('returns the current tail tip as the tail handle', () => {
    const points = calloutFamily.insert('callout-oval', SQUARE[0], SQUARE[1])
    const tail = calloutFamily.handles('callout-oval', points).find((h) => h.id === 'tail')
    expect(tail?.point).toEqual(points[2])
  })

  it('returns null for an unknown handle', () => {
    const points = calloutFamily.insert('callout-rectangle', SQUARE[0], SQUARE[1])
    expect(calloutFamily.move('callout-rectangle', points, 'bogus', { x: 1, y: 1 })).toBeNull()
  })
})

describe('calloutFamily dynamic tail origin', () => {
  it('a tip north of the body attaches to the top edge and paints above it', () => {
    for (const kind of KINDS) {
      const bitmap = renderWithTip(kind, { x: 20, y: -4 })
      expect(painted(bitmap, 20, 3), `${kind} above body`).toBe(true)
      expect(painted(bitmap, 20, 40), `${kind} no tail below`).toBe(false)
    }
  })

  it('a tip south of the body attaches to the bottom edge and paints below it', () => {
    for (const kind of KINDS) {
      const bitmap = renderWithTip(kind, { x: 20, y: 44 })
      expect(painted(bitmap, 19, 35), `${kind} below body`).toBe(true)
      expect(painted(bitmap, 20, 3), `${kind} no tail above`).toBe(false)
    }
  })

  it('a tip east of the body attaches to the right edge and paints beyond it', () => {
    for (const kind of KINDS) {
      const bitmap = renderWithTip(kind, { x: 46, y: 20 })
      expect(painted(bitmap, 40, 19), `${kind} right of body`).toBe(true)
      expect(painted(bitmap, 2, 19), `${kind} no tail left`).toBe(false)
    }
  })

  it('a tip west of the body attaches to the left edge and paints beyond it', () => {
    for (const kind of KINDS) {
      const bitmap = renderWithTip(kind, { x: -6, y: 20 })
      expect(painted(bitmap, 2, 19), `${kind} left of body`).toBe(true)
      expect(painted(bitmap, 40, 19), `${kind} no tail right`).toBe(false)
    }
  })
})

describe('calloutFamily tail from the body centre', () => {
  it('a tip past a corner grows the tail out of that corner along the centre-to-tip line', () => {
    for (const kind of KINDS) {
      // Body is (5, 5)-(34, 27.6), centre (19.5, 16.3); the ray towards (52, 50) leaves past the corner.
      const bitmap = renderWithTip(kind, { x: 52, y: 50 }, FILL_ONLY)
      expect(painted(bitmap, 38, 35), `${kind} on the ray`).toBe(true)
      expect(painted(bitmap, 42, 39), `${kind} further along the ray`).toBe(true)
      expect(painted(bitmap, 44, 30), `${kind} off the ray`).toBe(false)
    }
  })

  it('keeps the whole body when the tip sits inside it', () => {
    for (const kind of KINDS) {
      const inside = renderWithTip(kind, { x: 20, y: 16 }, FILL_ONLY)
      expect(painted(inside, 20, 16), kind).toBe(true)
      expect(painted(inside, 20, 33), kind).toBe(false)
    }
  })
})

describe('calloutFamily tail', () => {
  it('moving the tail replaces the tip anchor', () => {
    const points = calloutFamily.insert('callout-rectangle', SQUARE[0], SQUARE[1])
    const moved = calloutFamily.move('callout-rectangle', points, 'tail', { x: 33, y: 39 })
    expect(moved).not.toBeNull()
    expect(moved![2]).toEqual({ x: 33, y: 39 })
    expect(moved![0]).toEqual(points[0])
    expect(moved![1]).toEqual(points[1])
  })

  it('moving the tail changes the drawn tail pixels', () => {
    const before = renderDefault('callout-rectangle', FILL_ONLY)
    const after = renderWithTip('callout-rectangle', { x: 30, y: 42 }, FILL_ONLY)
    expect(after.data).not.toEqual(before.data)
    expect(painted(after, 27, 35)).toBe(true)
    expect(painted(before, 27, 35)).toBe(false)
  })

  it('keeps the tip at the same relative position when the box resizes', () => {
    const points = calloutFamily.insert('callout-rectangle', SQUARE[0], SQUARE[1])
    const resized = calloutFamily.move('callout-rectangle', points, 'se', { x: 44, y: 44 })!
    const box = normalizeRect(resized[0], resized[1])
    expect(resized[2].x).toBeCloseTo(box.x + 0.15 * box.width)
    expect(resized[2].y).toBeCloseTo(box.y + box.height)
  })
})

describe('calloutFamily rounded radius', () => {
  const KIND: ShapeKind = 'callout-rounded-rectangle'
  // The body is the top 78% of the 30px box: (5, 5) with size 30 x 23.4.
  const BODY_SIDE = 30 * 0.78

  function withRadius(x: number): Point[] {
    const points = calloutFamily.insert(KIND, SQUARE[0], SQUARE[1])
    return calloutFamily.move(KIND, points, 'radius', { x, y: 5 })!
  }

  function renderPoints(points: readonly Point[], style: ShapeStyle = FILL_ONLY): Bitmap {
    const bitmap = new Bitmap(60, 60)
    calloutFamily.render(bitmap, KIND, points, style)
    return bitmap
  }

  it('inserts the default body radius as a fourth anchor', () => {
    const points = calloutFamily.insert(KIND, SQUARE[0], SQUARE[1])
    expect(points).toHaveLength(4)
    expect(points[3].x).toBeCloseTo(BODY_SIDE * 0.2)
    expect(calloutFamily.insert('callout-rectangle', SQUARE[0], SQUARE[1])).toHaveLength(3)
  })

  it('places the radius handle at the body corner inset by the radius', () => {
    const points = calloutFamily.insert(KIND, SQUARE[0], SQUARE[1])
    const handle = calloutFamily.handles(KIND, points).find((h) => h.id === 'radius')!
    expect(handle.point.x).toBeCloseTo(5 + points[3].x)
    expect(handle.point.y).toBeCloseTo(5 + points[3].x)
  })

  it('draws the default radius exactly like the plain rounded callout outline', () => {
    const points = calloutFamily.insert(KIND, SQUARE[0], SQUARE[1])
    const box = normalizeRect(SQUARE[0], SQUARE[1])
    const actual = new Bitmap(60, 60)
    calloutFamily.render(actual, KIND, points, FILL_ONLY)
    const expected = new Bitmap(60, 60)
    fillPolygon(expected, callout(KIND, fillBox(outlineBox(box, 1), 0.25), points[2]), RED)
    expect(actual.data).toEqual(expected.data)
  })

  it('dragging the radius handle sets the radius, clamped to the body', () => {
    expect(withRadius(5 + 8)[3].x).toBeCloseTo(8)
    expect(withRadius(0)[3].x).toBe(0)
    expect(withRadius(100)[3].x).toBeCloseTo(BODY_SIDE / 2 - 1)
    const moved = withRadius(5 + 8)
    expect(moved[2]).toEqual(calloutFamily.insert(KIND, SQUARE[0], SQUARE[1])[2])
  })

  it('the radius changes the drawn corner pixels', () => {
    const square = renderPoints(withRadius(0))
    const round = renderPoints(withRadius(100))
    expect(painted(square, 5, 5)).toBe(true)
    expect(painted(round, 6, 6)).toBe(false)
    expect(painted(round, 19, 16)).toBe(true)
  })

  it('keeps the radius on resize, clamped to the smaller body', () => {
    const points = withRadius(5 + 6)
    const bigger = calloutFamily.move(KIND, points, 'se', { x: 54, y: 54 })!
    expect(bigger[3].x).toBeCloseTo(6)
    const smaller = calloutFamily.move(KIND, withRadius(100), 'se', { x: 15, y: 15 })!
    const body = 11 * 0.78
    expect(smaller[3].x).toBeCloseTo(body / 2 - 1)
  })

  it('keeps the tail attached for any radius', () => {
    for (const radius of [0, 4, 100]) {
      const points = withRadius(5 + radius)
      for (const tip of [
        { x: 20, y: 44 },
        { x: 52, y: 50 },
        { x: -6, y: -6 },
        { x: 46, y: 20 },
      ]) {
        const moved = calloutFamily.move(KIND, points, 'tail', tip)!
        expect(moved[3]).toEqual(points[3])
        const bitmap = renderPoints(moved)
        // The tail paints a continuous run from the body centre towards the tip.
        const centre = { x: 19.5, y: 16.3 }
        for (let t = 0; t <= 0.9; t += 0.05) {
          const x = Math.floor(centre.x + (tip.x - centre.x) * t)
          const y = Math.floor(centre.y + (tip.y - centre.y) * t)
          if (x < 0 || y < 0) continue
          expect(painted(bitmap, x, y), `r=${radius} tip=${tip.x},${tip.y} t=${t.toFixed(2)}`).toBe(true)
        }
      }
    }
  })
})
