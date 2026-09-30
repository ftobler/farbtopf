import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { arrowFamily } from './arrows'

const RED = rgba(255, 0, 0)
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }

/** Default thickness documented by the family. */
const DEFAULT_THICKNESS = 16

const KINDS: readonly ShapeKind[] = ['arrow', 'arrow-double', 'arrow-axis']

const TAIL: Point = { x: 20, y: 80 }
const TIP: Point = { x: 200, y: 80 }

function painted(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.get(x, y).a !== 0
}

function columnHeight(bitmap: Bitmap, x: number, y0: number, y1: number): number {
  let count = 0
  for (let y = y0; y <= y1; y += 1) if (painted(bitmap, x, y)) count += 1
  return count
}

function region(bitmap: Bitmap, x0: number, y0: number, x1: number, y1: number): boolean[][] {
  const grid: boolean[][] = []
  for (let y = y0; y <= y1; y += 1) {
    const row: boolean[] = []
    for (let x = x0; x <= x1; x += 1) row.push(painted(bitmap, x, y))
    grid.push(row)
  }
  return grid
}

function render(kind: ShapeKind, points: readonly Point[]): Bitmap {
  const bitmap = new Bitmap(300, 160)
  arrowFamily.render(bitmap, kind, points, FILL_ONLY)
  return bitmap
}

function fresh(kind: ShapeKind, tail: Point = TAIL, tip: Point = TIP): Point[] {
  return arrowFamily.insert(kind, tail, tip)
}

describe('arrowFamily', () => {
  it('exposes exactly the tail, tip and thickness handles', () => {
    const points = fresh('arrow', { x: 10, y: 50 }, { x: 90, y: 50 })
    const handles = arrowFamily.handles('arrow', points)
    expect(handles.map((handle) => handle.id)).toEqual(['tail', 'tip', 'thickness'])
    expect(handles[0].point).toEqual({ x: 10, y: 50 })
    expect(handles[1].point).toEqual({ x: 90, y: 50 })
    // Midpoint (50, 50) offset one thickness along the shaft normal (0, 1).
    expect(handles[2].point).toEqual({ x: 50, y: 50 + DEFAULT_THICKNESS })
  })

  it('inserts the endpoints with the default thickness for a free arrow', () => {
    for (const kind of ['arrow', 'arrow-double'] as const) {
      const points = fresh(kind)
      expect(points[0]).toEqual(TAIL)
      expect(points[1]).toEqual(TIP)
      expect(points[2]).toEqual({ x: DEFAULT_THICKNESS, y: 0 })
    }
  })

  it('snaps the axis arrow to horizontal or vertical when inserted', () => {
    expect(fresh('arrow-axis', { x: 10, y: 60 }, { x: 90, y: 20 })).toEqual([
      { x: 10, y: 60 },
      { x: 90, y: 60 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ])
    expect(fresh('arrow-axis', { x: 10, y: 60 }, { x: 30, y: 120 })).toEqual([
      { x: 10, y: 60 },
      { x: 10, y: 120 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ])
  })

  it('moves the endpoints freely on a free arrow and preserves the thickness', () => {
    const points = fresh('arrow')
    expect(arrowFamily.move('arrow', points, 'tail', { x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
      TIP,
      { x: DEFAULT_THICKNESS, y: 0 },
    ])
    expect(arrowFamily.move('arrow', points, 'tip', { x: 260, y: 140 })).toEqual([
      TAIL,
      { x: 260, y: 140 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ])
  })

  it('keeps the axis arrow straight while dragging either endpoint', () => {
    const points = fresh('arrow-axis', { x: 10, y: 50 }, { x: 90, y: 50 })
    expect(arrowFamily.move('arrow-axis', points, 'tip', { x: 70, y: 130 })).toEqual([
      { x: 10, y: 50 },
      { x: 10, y: 130 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ])
    expect(arrowFamily.move('arrow-axis', points, 'tail', { x: 150, y: 55 })).toEqual([
      { x: 150, y: 50 },
      { x: 90, y: 50 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ])
  })

  it('dragging the thickness handle grows both shaft and head', () => {
    const points = fresh('arrow')
    const thick = arrowFamily.move('arrow', points, 'thickness', { x: 110, y: 110 })
    expect(thick).not.toBeNull()
    expect(thick![2].x).toBeCloseTo(30)

    const base = render('arrow', points)
    const bigger = render('arrow', thick!)
    expect(columnHeight(bigger, 60, 0, 159)).toBeGreaterThan(columnHeight(base, 60, 0, 159))
  })

  it('clamps the thickness while dragging the handle', () => {
    const points = fresh('arrow')
    expect(arrowFamily.move('arrow', points, 'thickness', { x: 110, y: 80 })![2].x).toBe(1)
    expect(arrowFamily.move('arrow', points, 'thickness', { x: 110, y: 1000 })![2].x).toBe(256)
  })

  it('keeps the head size fixed when the arrow is made twice as long', () => {
    const short: Point[] = [{ x: 120, y: 80 }, { x: 200, y: 80 }, { x: DEFAULT_THICKNESS, y: 0 }]
    const long: Point[] = [{ x: 20, y: 80 }, { x: 200, y: 80 }, { x: DEFAULT_THICKNESS, y: 0 }]
    const a = render('arrow', short)
    const b = render('arrow', long)
    expect(region(a, 150, 55, 205, 105)).toEqual(region(b, 150, 55, 205, 105))
    expect(columnHeight(a, 195, 0, 159)).toBe(columnHeight(b, 195, 0, 159))
  })

  it('gives the double arrow a second head at the tail', () => {
    const single = render('arrow', fresh('arrow'))
    const double = render('arrow-double', fresh('arrow-double'))
    // Near the tail the single arrow only has its shaft; the double arrow has a head.
    expect(columnHeight(double, 60, 0, 159)).toBeGreaterThan(columnHeight(single, 60, 0, 159))
  })

  it('keeps the thickness when the endpoints move', () => {
    let points = fresh('arrow')
    points = arrowFamily.move('arrow', points, 'thickness', { x: 110, y: 100 })!
    expect(points[2].x).toBeCloseTo(20)
    points = arrowFamily.move('arrow', points, 'tail', { x: 5, y: 40 })!
    expect(points[2].x).toBeCloseTo(20)
    points = arrowFamily.move('arrow', points, 'tip', { x: 260, y: 130 })!
    expect(points[2].x).toBeCloseTo(20)
  })

  it('renders nothing for a degenerate arrow', () => {
    for (const kind of KINDS) {
      const points = [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: DEFAULT_THICKNESS, y: 0 }]
      const bitmap = new Bitmap(20, 20)
      arrowFamily.render(bitmap, kind, points, BOTH)
      expect(bitmap.data).toEqual(new Bitmap(20, 20).data)
    }
  })

  it('returns null for an unknown handle', () => {
    const points = fresh('arrow')
    expect(arrowFamily.move('arrow', points, 'bogus', { x: 1, y: 1 })).toBeNull()
  })
})
