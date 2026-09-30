import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import { normalizeRect } from '../geometry'
import type { Point } from '../geometry'
import type { ShapeStyle } from '../shapes'
import { POTATOID_CONTROLS, potatoidOutline, renderShape } from '../shapes'
import { potatoidFamily } from './potatoid'

const RED = rgba(255, 0, 0)
const START: Point = { x: 5, y: 5 }
const END: Point = { x: 34, y: 34 }
const WIDE_END: Point = { x: 44, y: 24 }
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }

/** The sharpest turn between consecutive outline segments, in radians. */
function maxTurn(points: readonly Point[]): number {
  let max = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[(i - 1 + points.length) % points.length]
    const b = points[i]
    const c = points[(i + 1) % points.length]
    const first = Math.atan2(b.y - a.y, b.x - a.x)
    const second = Math.atan2(c.y - b.y, c.x - b.x)
    let turn = Math.abs(second - first)
    if (turn > Math.PI) turn = 2 * Math.PI - turn
    max = Math.max(max, turn)
  }
  return max
}

describe('potatoidFamily insert', () => {
  it('keeps the box corners and starts every control at rest', () => {
    const points = potatoidFamily.insert('potatoid', START, END)
    expect(points).toHaveLength(2 + POTATOID_CONTROLS)
    expect(points[0]).toEqual(START)
    expect(points[1]).toEqual(END)
    for (const offset of points.slice(2)) expect(offset).toEqual({ x: 0, y: 0 })
  })
})

describe('potatoidFamily handles', () => {
  it('exposes one handle per control point', () => {
    const ids = potatoidFamily.handles('potatoid', potatoidFamily.insert('potatoid', START, END)).map((h) => h.id)
    expect(ids).toEqual(Array.from({ length: POTATOID_CONTROLS }, (_, i) => `c${i}`))
  })

  it('lays the controls around the box', () => {
    const box = normalizeRect(START, END)
    const margin = Math.min(box.width, box.height) * 0.25
    const handles = potatoidFamily.handles('potatoid', potatoidFamily.insert('potatoid', START, END))
    for (const handle of handles) {
      expect(handle.point.x).toBeGreaterThanOrEqual(box.x - margin)
      expect(handle.point.x).toBeLessThanOrEqual(box.x + box.width + margin)
      expect(handle.point.y).toBeGreaterThanOrEqual(box.y - margin)
      expect(handle.point.y).toBeLessThanOrEqual(box.y + box.height + margin)
    }
  })
})

describe('potatoidFamily tweak', () => {
  it('moves the control to where it is dragged and keeps the others', () => {
    const points = potatoidFamily.insert('potatoid', START, END)
    const moved = potatoidFamily.move('potatoid', points, 'c0', { x: 20, y: 2 })
    expect(moved).not.toBeNull()
    expect(moved![0]).toEqual(points[0])
    expect(moved![1]).toEqual(points[1])
    const handle = potatoidFamily.handles('potatoid', moved!).find((h) => h.id === 'c0')!
    expect(handle.point.x).toBeCloseTo(20)
    expect(handle.point.y).toBeCloseTo(2)
    for (let i = 1; i < POTATOID_CONTROLS; i += 1) expect(moved![2 + i]).toEqual(points[2 + i])
  })

  it('changes the drawn pixels', () => {
    const base = potatoidFamily.insert('potatoid', START, END)
    const dented = potatoidFamily.move('potatoid', base, 'c1', { x: 20, y: 20 })!
    const before = new Bitmap(60, 60)
    potatoidFamily.render(before, 'potatoid', base, FILL_ONLY)
    const after = new Bitmap(60, 60)
    potatoidFamily.render(after, 'potatoid', dented, FILL_ONLY)
    expect(after.data).not.toEqual(before.data)
  })

  it('returns null for an unknown handle', () => {
    const points = potatoidFamily.insert('potatoid', START, END)
    expect(potatoidFamily.move('potatoid', points, 'bogus', { x: 1, y: 1 })).toBeNull()
    expect(potatoidFamily.move('potatoid', points, 'c0x', { x: 1, y: 1 })).toBeNull()
    expect(potatoidFamily.move('potatoid', points, 'e', { x: 1, y: 1 })).toBeNull()
  })
})

describe('potatoid outline', () => {
  it('stays smooth however far a control is pulled', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 }
    const offsets = Array.from({ length: POTATOID_CONTROLS }, () => ({ x: 0, y: 0 }))
    offsets[0] = { x: -0.5, y: 0.2 }
    offsets[2] = { x: 0.4, y: -0.2 }
    offsets[3] = { x: 0.2, y: 0.4 }
    for (const shape of [potatoidOutline(box), potatoidOutline(box, offsets)]) {
      expect(shape.length).toBeGreaterThan(3)
      // A polygon corner would turn ~90°; a smooth blob never bites a knick.
      expect(maxTurn(shape)).toBeLessThan(0.6)
    }
  })

  it('fills the unit square when the controls are at rest', () => {
    const shape = potatoidOutline({ x: 0, y: 0, width: 80, height: 40 })
    expect(Math.min(...shape.map((p) => p.x))).toBeCloseTo(0)
    expect(Math.max(...shape.map((p) => p.x))).toBeCloseTo(80)
    expect(Math.min(...shape.map((p) => p.y))).toBeCloseTo(0)
    expect(Math.max(...shape.map((p) => p.y))).toBeCloseTo(40)
  })
})

describe('potatoidFamily parity with renderShape', () => {
  it('renders exactly like renderShape for square and non-square boxes', () => {
    for (const end of [END, WIDE_END]) {
      for (const style of [FILL_ONLY, BOTH]) {
        const actual = new Bitmap(60, 60)
        potatoidFamily.render(actual, 'potatoid', potatoidFamily.insert('potatoid', START, end), style)
        const expected = new Bitmap(60, 60)
        renderShape(expected, 'potatoid', [START, end], style)
        expect(actual.data).toEqual(expected.data)
      }
    }
  })
})
