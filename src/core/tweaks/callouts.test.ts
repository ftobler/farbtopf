import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import { normalizeRect } from '../geometry'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { renderShape } from '../shapes'
import { calloutFamily } from './callouts'

const RED = rgba(255, 0, 0)
const KINDS: ShapeKind[] = ['callout-rectangle', 'callout-rounded-rectangle', 'callout-oval']
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const OUTLINE_ONLY: ShapeStyle = { width: 1, stroke: BLACK, fill: null }

const SQUARE: [Point, Point] = [
  { x: 5, y: 5 },
  { x: 34, y: 34 },
]
const WIDE: [Point, Point] = [
  { x: 5, y: 5 },
  { x: 44, y: 24 },
]
const TALL: [Point, Point] = [
  { x: 5, y: 5 },
  { x: 24, y: 44 },
]
const BOXES: [Point, Point][] = [SQUARE, WIDE, TALL]

function painted(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.get(x, y).a !== 0
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
    const points = calloutFamily.insert('callout-rectangle', SQUARE[0], SQUARE[1])
    const moved = calloutFamily.move('callout-rectangle', points, 'tail', { x: 33, y: 39 })!
    const before = new Bitmap(50, 50)
    calloutFamily.render(before, 'callout-rectangle', points, FILL_ONLY)
    const after = new Bitmap(50, 50)
    calloutFamily.render(after, 'callout-rectangle', moved, FILL_ONLY)
    expect(after.data).not.toEqual(before.data)
    expect(painted(after, 21, 32)).toBe(true)
    expect(painted(before, 21, 32)).toBe(false)
  })

  it('keeps the tail at the same relative position when the box resizes', () => {
    const points = calloutFamily.insert('callout-rectangle', SQUARE[0], SQUARE[1])
    const resized = calloutFamily.move('callout-rectangle', points, 'se', { x: 44, y: 44 })!
    const box = normalizeRect(resized[0], resized[1])
    expect(resized[2].x).toBeCloseTo(box.x + 0.15 * box.width)
    expect(resized[2].y).toBeCloseTo(box.y + box.height)
  })
})

describe('calloutFamily parity with renderShape', () => {
  for (const kind of KINDS) {
    for (const anchors of BOXES) {
      const label = `${kind} ${anchors[0].x},${anchors[0].y}-${anchors[1].x},${anchors[1].y}`
      for (const [name, style] of [
        ['fill', FILL_ONLY],
        ['outline', OUTLINE_ONLY],
        ['both', BOTH],
      ] as [string, ShapeStyle][]) {
        it(`${label} ${name}`, () => {
          const points = calloutFamily.insert(kind, anchors[0], anchors[1])
          const actual = new Bitmap(60, 60)
          calloutFamily.render(actual, kind, points, style)
          const expected = new Bitmap(60, 60)
          renderShape(expected, kind, anchors, style)
          expect(actual.data).toEqual(expected.data)
        })
      }
    }
  }
})
