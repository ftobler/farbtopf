import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import { normalizeRect } from '../geometry'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
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
    expect(painted(after, 29, 35)).toBe(true)
    expect(painted(before, 29, 35)).toBe(false)
  })

  it('keeps the tip at the same relative position when the box resizes', () => {
    const points = calloutFamily.insert('callout-rectangle', SQUARE[0], SQUARE[1])
    const resized = calloutFamily.move('callout-rectangle', points, 'se', { x: 44, y: 44 })!
    const box = normalizeRect(resized[0], resized[1])
    expect(resized[2].x).toBeCloseTo(box.x + 0.15 * box.width)
    expect(resized[2].y).toBeCloseTo(box.y + box.height)
  })
})
