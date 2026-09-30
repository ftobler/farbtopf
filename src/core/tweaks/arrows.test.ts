import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { renderShape } from '../shapes'
import { arrowFamily } from './arrows'

const RED = rgba(255, 0, 0)
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }

const KINDS: readonly ShapeKind[] = ['arrow-right', 'arrow-left', 'arrow-up', 'arrow-down']

const SQUARE: readonly [Point, Point] = [
  { x: 5, y: 5 },
  { x: 34, y: 34 },
]
const WIDE: readonly [Point, Point] = [
  { x: 5, y: 5 },
  { x: 44, y: 24 },
]

function painted(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.get(x, y).a !== 0
}

describe('arrowFamily', () => {
  it('inserts start, end and a default shaft anchor', () => {
    const start = { x: 3, y: 7 }
    const end = { x: 20, y: 15 }
    const points = arrowFamily.insert('arrow-right', start, end)
    expect(points).toEqual([start, end, { x: 0.25, y: 0 }])
  })

  it('exposes the eight box handles plus the shaft handle', () => {
    const points = arrowFamily.insert('arrow-right', SQUARE[0], SQUARE[1])
    expect(arrowFamily.handles('arrow-right', points).map((h) => h.id)).toEqual([
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'shaft',
    ])
  })

  it('places the shaft handle at the kind-transformed notch corner', () => {
    const box = { x: 5, y: 5, width: 30, height: 30 }
    const expected: Record<string, Point> = {
      'arrow-right': { x: box.x + 0.5 * box.width, y: box.y + 0.25 * box.height },
      'arrow-left': { x: box.x + 0.5 * box.width, y: box.y + 0.25 * box.height },
      'arrow-down': { x: box.x + 0.25 * box.width, y: box.y + 0.5 * box.height },
      'arrow-up': { x: box.x + 0.25 * box.width, y: box.y + 0.5 * box.height },
    }
    for (const kind of KINDS) {
      const points = arrowFamily.insert(kind, SQUARE[0], SQUARE[1])
      const shaft = arrowFamily.handles(kind, points).find((h) => h.id === 'shaft')
      expect(shaft?.point).toEqual(expected[kind])
    }
  })

  it('returns null for an unknown handle', () => {
    const points = arrowFamily.insert('arrow-right', SQUARE[0], SQUARE[1])
    expect(arrowFamily.move('arrow-right', points, 'bogus', { x: 1, y: 1 })).toBeNull()
  })

  it('renders exactly like renderShape at the default shaft thickness', () => {
    for (const kind of KINDS) {
      for (const anchors of [SQUARE, WIDE]) {
        const points = arrowFamily.insert(kind, anchors[0], anchors[1])
        const actual = new Bitmap(50, 50)
        arrowFamily.render(actual, kind, points, BOTH)
        const expected = new Bitmap(50, 50)
        renderShape(expected, kind, [anchors[0], anchors[1]], BOTH)
        expect(actual.data).toEqual(expected.data)
      }
    }
  })

  it('renders exactly like renderShape at the default with fill only', () => {
    const points = arrowFamily.insert('arrow-down', WIDE[0], WIDE[1])
    const actual = new Bitmap(50, 50)
    arrowFamily.render(actual, 'arrow-down', points, FILL_ONLY)
    const expected = new Bitmap(50, 50)
    renderShape(expected, 'arrow-down', [WIDE[0], WIDE[1]], FILL_ONLY)
    expect(actual.data).toEqual(expected.data)
  })

  it('the shaft handle changes the shaft pixels', () => {
    const base = arrowFamily.insert('arrow-right', SQUARE[0], SQUARE[1])
    const thin = arrowFamily.move('arrow-right', base, 'shaft', { x: 20, y: 21.5 })
    expect(thin).not.toBeNull()
    expect(thin![2].x).toBeCloseTo(0.05)
    expect(thin![2].y).toBe(0)

    const wide = new Bitmap(40, 40)
    arrowFamily.render(wide, 'arrow-right', base, FILL_ONLY)
    const narrow = new Bitmap(40, 40)
    arrowFamily.render(narrow, 'arrow-right', thin!, FILL_ONLY)

    expect(narrow.data).not.toEqual(wide.data)
    expect(painted(wide, 10, 13)).toBe(true)
    expect(painted(narrow, 10, 13)).toBe(false)
  })

  it('clamps the shaft thickness while dragging the shaft handle', () => {
    const points = arrowFamily.insert('arrow-right', SQUARE[0], SQUARE[1])
    const huge = arrowFamily.move('arrow-right', points, 'shaft', { x: 20, y: 5 })
    expect(huge![2].x).toBe(0.45)
    const tiny = arrowFamily.move('arrow-right', points, 'shaft', { x: 20, y: 20 })
    expect(tiny![2].x).toBe(0.05)
  })
})
