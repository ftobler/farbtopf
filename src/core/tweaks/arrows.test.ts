import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import type { Point } from '../geometry'
import type { ShapeStyle } from '../shapes'
import { arrowFamily } from './arrows'

type ArrowKind = 'arrow-right' | 'arrow-left' | 'arrow-up' | 'arrow-down'

const RED = rgba(255, 0, 0)
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }

/** Default thickness documented by the family. */
const DEFAULT_THICKNESS = 4

const KINDS: readonly ArrowKind[] = ['arrow-right', 'arrow-left', 'arrow-up', 'arrow-down']

const START: Point = { x: 10, y: 60 }
const END: Point = { x: 90, y: 20 }

function painted(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.get(x, y).a !== 0
}

function columnHeight(bitmap: Bitmap, x: number, y0: number, y1: number): number {
  let count = 0
  for (let y = y0; y <= y1; y += 1) if (painted(bitmap, x, y)) count += 1
  return count
}

function maxColumnHeight(bitmap: Bitmap): number {
  let max = 0
  for (let x = 0; x < bitmap.width; x += 1) {
    max = Math.max(max, columnHeight(bitmap, x, 0, bitmap.height - 1))
  }
  return max
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

function render(points: readonly Point[]): Bitmap {
  const bitmap = new Bitmap(256, 128)
  arrowFamily.render(bitmap, 'arrow-right', points, FILL_ONLY)
  return bitmap
}

describe('arrowFamily', () => {
  it('insert orients tail and tip by the kind direction, keeping each endpoint', () => {
    const expected: Record<ArrowKind, [Point, Point]> = {
      'arrow-right': [START, END],
      'arrow-left': [END, START],
      'arrow-up': [START, END],
      'arrow-down': [END, START],
    }
    for (const kind of KINDS) {
      const points = arrowFamily.insert(kind, START, END)
      expect(points[0]).toEqual(expected[kind][0])
      expect(points[1]).toEqual(expected[kind][1])
      expect(points[2]).toEqual({ x: DEFAULT_THICKNESS, y: 0 })
    }
  })

  it('exposes exactly the tail, tip and thickness handles', () => {
    const points = arrowFamily.insert('arrow-right', { x: 10, y: 50 }, { x: 90, y: 50 })
    const handles = arrowFamily.handles('arrow-right', points)
    expect(handles.map((handle) => handle.id)).toEqual(['tail', 'tip', 'thickness'])
    expect(handles[0].point).toEqual({ x: 10, y: 50 })
    expect(handles[1].point).toEqual({ x: 90, y: 50 })
    // Midpoint (50, 50) offset by one thickness along the shaft normal (0, 1).
    expect(handles[2].point).toEqual({ x: 50, y: 54 })
  })

  it('moves the tail and tip without touching the thickness', () => {
    const points = arrowFamily.insert('arrow-right', { x: 10, y: 50 }, { x: 90, y: 50 })
    expect(arrowFamily.move('arrow-right', points, 'tail', { x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 90, y: 50 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ])
    expect(arrowFamily.move('arrow-right', points, 'tip', { x: 100, y: 70 })).toEqual([
      { x: 10, y: 50 },
      { x: 100, y: 70 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ])
  })

  it('dragging the thickness handle grows both shaft and head', () => {
    const points = arrowFamily.insert('arrow-right', { x: 10, y: 50 }, { x: 90, y: 50 })
    const thick = arrowFamily.move('arrow-right', points, 'thickness', { x: 50, y: 70 })
    expect(thick).not.toBeNull()
    expect(thick![2].x).toBeCloseTo(20)

    const base = render(points)
    const bigger = render(thick!)
    expect(columnHeight(bigger, 30, 0, 127)).toBeGreaterThan(columnHeight(base, 30, 0, 127))
    expect(maxColumnHeight(bigger)).toBeGreaterThan(maxColumnHeight(base))
  })

  it('clamps the thickness while dragging the handle', () => {
    const points = arrowFamily.insert('arrow-right', { x: 10, y: 50 }, { x: 90, y: 50 })
    const onLine = arrowFamily.move('arrow-right', points, 'thickness', { x: 50, y: 50 })
    expect(onLine![2].x).toBe(1)
    const far = arrowFamily.move('arrow-right', points, 'thickness', { x: 50, y: 500 })
    expect(far![2].x).toBe(64)
  })

  it('keeps the head size fixed when the arrow is made twice as long', () => {
    const short: readonly Point[] = [
      { x: 60, y: 50 },
      { x: 100, y: 50 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ]
    const long: readonly Point[] = [
      { x: 20, y: 50 },
      { x: 100, y: 50 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ]
    const a = render(short)
    const b = render(long)
    expect(region(a, 80, 35, 105, 65)).toEqual(region(b, 80, 35, 105, 65))
    expect(columnHeight(a, 95, 0, 127)).toBe(columnHeight(b, 95, 0, 127))
  })

  it('keeps the thickness when the endpoints move', () => {
    let points = arrowFamily.insert('arrow-right', { x: 10, y: 50 }, { x: 90, y: 50 })
    points = arrowFamily.move('arrow-right', points, 'thickness', { x: 50, y: 65 })!
    expect(points[2].x).toBeCloseTo(15)
    points = arrowFamily.move('arrow-right', points, 'tail', { x: 5, y: 40 })!
    expect(points[2].x).toBeCloseTo(15)
    points = arrowFamily.move('arrow-right', points, 'tip', { x: 120, y: 60 })!
    expect(points[2].x).toBeCloseTo(15)
  })

  it('renders nothing for a degenerate arrow', () => {
    const points = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: DEFAULT_THICKNESS, y: 0 },
    ]
    const bitmap = new Bitmap(20, 20)
    arrowFamily.render(bitmap, 'arrow-right', points, BOTH)
    expect(bitmap.data).toEqual(new Bitmap(20, 20).data)
  })

  it('returns null for an unknown handle', () => {
    const points = arrowFamily.insert('arrow-right', { x: 10, y: 50 }, { x: 90, y: 50 })
    expect(arrowFamily.move('arrow-right', points, 'bogus', { x: 1, y: 1 })).toBeNull()
  })
})
