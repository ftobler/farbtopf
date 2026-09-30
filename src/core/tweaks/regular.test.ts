import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import { normalizeRect } from '../geometry'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { renderShape } from '../shapes'
import { regularFamily } from './regular'

const RED = rgba(255, 0, 0)
const START: Point = { x: 5, y: 5 }
const END: Point = { x: 34, y: 34 }
const WIDE_END: Point = { x: 44, y: 24 }
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }
const KINDS: readonly ShapeKind[] = ['pentagon', 'heptagon']

function render(kind: ShapeKind, points: readonly Point[], style: ShapeStyle): Bitmap {
  const bitmap = new Bitmap(60, 60)
  regularFamily.render(bitmap, kind, points, style)
  return bitmap
}

describe('regularFamily insert', () => {
  it('inserts the rotation anchor after start and end', () => {
    expect(regularFamily.insert('pentagon', START, END)).toEqual([START, END, { x: 0, y: 0 }])
  })

  it('exposes the eight box handles plus the rotate handle', () => {
    const points = regularFamily.insert('pentagon', START, END)
    expect(regularFamily.handles('pentagon', points).map((h) => h.id)).toEqual([
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'rotate',
    ])
  })

  it('places the rotate handle at the top vertex by default', () => {
    const points = regularFamily.insert('pentagon', START, END)
    const box = normalizeRect(START, END)
    const handle = regularFamily.handles('pentagon', points).find((h) => h.id === 'rotate')
    expect(handle).toBeDefined()
    expect(handle!.point.x).toBeCloseTo(box.x + box.width / 2)
    expect(handle!.point.y).toBeCloseTo(box.y + box.height / 2 - Math.min(box.width, box.height) / 2)
  })
})

describe('regularFamily parity with renderShape', () => {
  for (const kind of KINDS) {
    it(`${kind} renders exactly like renderShape for a square and a non-square box`, () => {
      for (const end of [END, WIDE_END]) {
        const points = regularFamily.insert(kind, START, end)
        const actual = render(kind, points, BOTH)
        const expected = new Bitmap(60, 60)
        renderShape(expected, kind, [START, end], BOTH)
        expect(actual.data).toEqual(expected.data)
      }
    })
  }
})

describe('regularFamily rotate', () => {
  it('changes the rendered pixels for both kinds', () => {
    for (const kind of KINDS) {
      const base = regularFamily.insert(kind, START, END)
      const points = regularFamily.move(kind, base, 'rotate', { x: 50, y: 20 })
      expect(points).not.toBeNull()
      expect(points![2].x).not.toBe(0)
      const rotated = render(kind, points!, BOTH)
      expect(rotated.data).not.toEqual(render(kind, base, BOTH).data)
    }
  })

  it('uses atan2 of the dragged point around the box centre', () => {
    const points = regularFamily.insert('pentagon', START, END)
    const box = normalizeRect(START, END)
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const moved = regularFamily.move('pentagon', points, 'rotate', { x: cx + 10, y: cy + 10 })
    expect(moved![2].x).toBeCloseTo(Math.atan2(10, 10) + Math.PI / 2)
  })

  it('keeps the rotation angle while resizing', () => {
    const base = regularFamily.insert('pentagon', START, END)
    const rotated = regularFamily.move('pentagon', base, 'rotate', { x: 50, y: 20 })!
    const resized = regularFamily.move('pentagon', rotated, 'se', { x: 44, y: 44 })
    expect(resized).not.toBeNull()
    expect(resized![2]).toEqual(rotated[2])
    expect(normalizeRect(resized![0], resized![1])).toEqual({ x: 5, y: 5, width: 40, height: 40 })
  })

  it('returns null for an unknown handle', () => {
    const points = regularFamily.insert('pentagon', START, END)
    expect(regularFamily.move('pentagon', points, 'bogus', { x: 1, y: 1 })).toBeNull()
  })
})

describe('regularFamily fill-only rendering', () => {
  it('paints the interior for both kinds', () => {
    for (const kind of KINDS) {
      const points = regularFamily.insert(kind, START, END)
      const bitmap = render(kind, points, FILL_ONLY)
      expect(bitmap.get(20, 20).a).toBe(255)
    }
  })
})
