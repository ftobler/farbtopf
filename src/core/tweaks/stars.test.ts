import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import { normalizeRect } from '../geometry'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { renderShape } from '../shapes'
import { starFamily } from './stars'

const RED = rgba(255, 0, 0)
const START: Point = { x: 5, y: 5 }
const END: Point = { x: 34, y: 34 }
const WIDE_END: Point = { x: 44, y: 24 }
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }
const KINDS: readonly ShapeKind[] = ['star-4', 'star-5', 'star-6']

function parity(kind: ShapeKind, start: Point, end: Point, style: ShapeStyle): void {
  const actual = new Bitmap(60, 60)
  starFamily.render(actual, kind, starFamily.insert(kind, start, end), style)
  const expected = new Bitmap(60, 60)
  renderShape(expected, kind, [start, end], style)
  expect(actual.data).toEqual(expected.data)
}

function painted(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.get(x, y).a !== 0
}

describe('starFamily insert', () => {
  it('stores the default inner ratio in the third anchor', () => {
    expect(starFamily.insert('star-4', START, END)).toEqual([START, END, { x: 0.4, y: 0 }])
    expect(starFamily.insert('star-5', START, END)).toEqual([START, END, { x: 0.4, y: 0 }])
    expect(starFamily.insert('star-6', START, END)).toEqual([START, END, { x: 0.5, y: 0 }])
  })
})

describe('starFamily handles', () => {
  it('exposes the eight box handles plus the inner handle', () => {
    for (const kind of KINDS) {
      const points = starFamily.insert(kind, START, END)
      expect(starFamily.handles(kind, points).map((h) => h.id)).toEqual([
        'nw',
        'n',
        'ne',
        'e',
        'se',
        's',
        'sw',
        'w',
        'inner',
      ])
    }
  })

  it('places the inner handle on the first inner vertex of the star', () => {
    const points = starFamily.insert('star-4', START, END)
    const handle = starFamily.handles('star-4', points).find((h) => h.id === 'inner')
    expect(handle).toBeDefined()
    expect(handle!.point.x).toBeCloseTo(24.242640687, 3)
    expect(handle!.point.y).toBeCloseTo(15.757359313, 3)
  })

  it('moves the inner handle away from the centre as the ratio grows', () => {
    const centre = { x: 20, y: 20 }
    for (const kind of KINDS) {
      const low = starFamily.handles(kind, [START, END, { x: 0.4, y: 0 }]).find((h) => h.id === 'inner')!
      const high = starFamily.handles(kind, [START, END, { x: 0.9, y: 0 }]).find((h) => h.id === 'inner')!
      const lowDistance = Math.hypot(low.point.x - centre.x, low.point.y - centre.y)
      const highDistance = Math.hypot(high.point.x - centre.x, high.point.y - centre.y)
      expect(highDistance).toBeGreaterThan(lowDistance)
    }
  })
})

describe('starFamily inner tweak', () => {
  it('round-trips the inner ratio when the handle is grabbed without moving', () => {
    const ratios = [0.2, 0.4, 0.5, 0.8]
    for (const kind of KINDS) {
      for (const end of [END, WIDE_END]) {
        for (const ratio of ratios) {
          const base = starFamily.insert(kind, START, end)
          const points = [base[0], base[1], { x: ratio, y: 0 }]
          const handle = starFamily.handles(kind, points).find((h) => h.id === 'inner')!
          const moved = starFamily.move(kind, points, 'inner', handle.point)
          expect(moved).not.toBeNull()
          expect(moved![2].x).toBeCloseTo(ratio, 6)

          const regrabbed = starFamily.handles(kind, moved!).find((h) => h.id === 'inner')!
          const again = starFamily.move(kind, moved!, 'inner', regrabbed.point)
          expect(again).not.toBeNull()
          expect(again![2].x).toBeCloseTo(ratio, 6)
        }
      }
    }
  })

  it('round-trips the inner ratio on non-square boxes', () => {
    const points = starFamily.insert('star-5', START, WIDE_END)
    const handle = starFamily.handles('star-5', points).find((h) => h.id === 'inner')!
    const moved = starFamily.move('star-5', points, 'inner', handle.point)
    expect(moved).not.toBeNull()
    expect(moved![2].x).toBeCloseTo(0.4, 6)
  })

  it('increases the ratio as the inner handle moves outward from the centre', () => {
    for (const kind of KINDS) {
      const points = starFamily.insert(kind, START, END)
      const box = normalizeRect(START, END)
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const handle = starFamily.handles(kind, points).find((h) => h.id === 'inner')!
      const inward = starFamily.move(kind, points, 'inner', {
        x: centre.x + (handle.point.x - centre.x) / 2,
        y: centre.y + (handle.point.y - centre.y) / 2,
      })!
      const outward = starFamily.move(kind, points, 'inner', {
        x: centre.x + (handle.point.x - centre.x) * 1.5,
        y: centre.y + (handle.point.y - centre.y) * 1.5,
      })!
      expect(outward[2].x).toBeGreaterThan(inward[2].x)
    }
  })

  it('clamps the ratio to [0.05, 0.95]', () => {
    const points = starFamily.insert('star-5', START, END)
    expect(starFamily.move('star-5', points, 'inner', { x: 20, y: 20 })![2].x).toBeCloseTo(0.05, 6)
    expect(starFamily.move('star-5', points, 'inner', { x: 200, y: 20 })![2].x).toBeCloseTo(0.95, 6)
  })

  it('changes the star pixels', () => {
    const base = starFamily.insert('star-5', START, END)
    const shrunk = starFamily.move('star-5', base, 'inner', { x: 20, y: 20 })!
    expect(shrunk[2].x).not.toBe(base[2].x)

    const before = new Bitmap(60, 60)
    starFamily.render(before, 'star-5', base, FILL_ONLY)
    const after = new Bitmap(60, 60)
    starFamily.render(after, 'star-5', shrunk, FILL_ONLY)

    expect(after.data).not.toEqual(before.data)
    expect(painted(before, 20, 20)).toBe(true)
    expect(painted(after, 12, 12)).toBe(false)
  })

  it('keeps the ratio when resizing with a box handle', () => {
    const base = starFamily.insert('star-4', START, END)
    const tuned = starFamily.move('star-4', base, 'inner', { x: 32, y: 20 })!
    const resized = starFamily.move('star-4', tuned, 'se', { x: 44, y: 44 })
    expect(resized).not.toBeNull()
    expect(resized![2].x).toBeCloseTo(tuned[2].x, 6)
    expect(normalizeRect(resized![0], resized![1])).toEqual({ x: 5, y: 5, width: 40, height: 40 })
  })

  it('returns null for an unknown handle', () => {
    const points = starFamily.insert('star-6', START, END)
    expect(starFamily.move('star-6', points, 'bogus', { x: 1, y: 1 })).toBeNull()
  })
})

describe('starFamily parity with renderShape', () => {
  for (const kind of KINDS) {
    it(`${kind} renders exactly like renderShape for square and non-square boxes`, () => {
      for (const end of [END, WIDE_END]) {
        parity(kind, START, end, BOTH)
        parity(kind, START, end, FILL_ONLY)
      }
    })
  }
})
