import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK } from '../color'
import type { Point } from '../geometry'
import { drawBezier, drawLine } from '../raster'
import type { ShapeStyle } from '../shapes'
import { curveFamily } from './curve'

const P0: Point = { x: 5, y: 5 }
const P3: Point = { x: 35, y: 35 }
const STROKE: ShapeStyle = { width: 3, stroke: BLACK, fill: null }

describe('curveFamily', () => {
  it('inserts the control points at the chord thirds', () => {
    const points = curveFamily.insert('polyline', P0, P3)
    expect(points).toHaveLength(4)
    expect(points[0]).toEqual(P0)
    expect(points[1]).toEqual({ x: 15, y: 15 })
    expect(points[2]).toEqual({ x: 25, y: 25 })
    expect(points[3]).toEqual(P3)
  })

  it('exposes p0, c1, c2 and p3 handles', () => {
    const points = curveFamily.insert('polyline', P0, P3)
    expect(curveFamily.handles('polyline', points).map((h) => h.id)).toEqual(['p0', 'c1', 'c2', 'p3'])
  })

  it('moving p0 carries c1 by the drag delta', () => {
    const points = curveFamily.insert('polyline', P0, P3)
    const moved = curveFamily.move('polyline', points, 'p0', { x: 0, y: 0 })
    expect(moved).not.toBeNull()
    expect(moved![0]).toEqual({ x: 0, y: 0 })
    expect(moved![1]).toEqual({ x: 10, y: 10 })
    expect(moved![2]).toEqual(points[2])
    expect(moved![3]).toEqual(points[3])
  })

  it('moving p3 carries c2 by the drag delta', () => {
    const points = curveFamily.insert('polyline', P0, P3)
    const moved = curveFamily.move('polyline', points, 'p3', { x: 40, y: 40 })
    expect(moved![3]).toEqual({ x: 40, y: 40 })
    expect(moved![2]).toEqual({ x: 30, y: 30 })
    expect(moved![0]).toEqual(points[0])
    expect(moved![1]).toEqual(points[1])
  })

  it('returns null for an unknown handle', () => {
    const points = curveFamily.insert('polyline', P0, P3)
    expect(curveFamily.move('polyline', points, 'bogus', { x: 1, y: 1 })).toBeNull()
  })

  it('render delegates to the bezier path', () => {
    const points = curveFamily.insert('polyline', P0, P3)
    const actual = new Bitmap(40, 40)
    curveFamily.render(actual, 'polyline', points, STROKE)
    const expected = new Bitmap(40, 40)
    drawBezier(expected, [points[0], points[1], points[2], points[3]], STROKE.width, BLACK)
    expect(actual.data).toEqual(expected.data)
  })

  it('render is a no-op without a stroke', () => {
    const points = curveFamily.insert('polyline', P0, P3)
    const bitmap = new Bitmap(40, 40)
    curveFamily.render(bitmap, 'polyline', points, { width: 3, stroke: null, fill: BLACK })
    expect(bitmap.data.every((value) => value === 0)).toBe(true)
  })
})

describe('curveFamily lines', () => {
  it('inserts a line as its two ends', () => {
    expect(curveFamily.insert('line', P0, P3)).toEqual([P0, P3])
  })

  it('exposes a handle at each end', () => {
    expect(curveFamily.handles('line', [P0, P3])).toEqual([
      { id: 'p0', point: P0 },
      { id: 'p1', point: P3 },
    ])
  })

  it('moves only the dragged end', () => {
    expect(curveFamily.move('line', [P0, P3], 'p0', { x: 1, y: 2 })).toEqual([{ x: 1, y: 2 }, P3])
    expect(curveFamily.move('line', [P0, P3], 'p1', { x: 9, y: 8 })).toEqual([P0, { x: 9, y: 8 }])
    expect(curveFamily.move('line', [P0, P3], 'c1', { x: 9, y: 8 })).toBeNull()
  })

  it('draws exactly the plain round-capped line', () => {
    const actual = new Bitmap(40, 40)
    curveFamily.render(actual, 'line', [P0, { x: 33, y: 12 }], STROKE)
    const expected = new Bitmap(40, 40)
    drawLine(expected, P0, { x: 33, y: 12 }, STROKE.width, BLACK, 'round')
    expect(actual.data).toEqual(expected.data)
  })
})
