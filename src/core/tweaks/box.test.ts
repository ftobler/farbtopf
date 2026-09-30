import { describe, expect, it } from 'vitest'
import { Bitmap } from '../bitmap'
import { BLACK, rgba } from '../color'
import { normalizeRect } from '../geometry'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { renderShape } from '../shapes'
import { boxFamily } from './box'

const RED = rgba(255, 0, 0)
const START: Point = { x: 5, y: 5 }
const END: Point = { x: 34, y: 34 }
const WIDE_END: Point = { x: 44, y: 24 }
const FILL_ONLY: ShapeStyle = { width: 1, stroke: null, fill: RED }
const BOTH: ShapeStyle = { width: 2, stroke: BLACK, fill: RED }

const BOX_KINDS: readonly ShapeKind[] = ['rectangle', 'diamond']

function render(
  bitmap: Bitmap,
  kind: 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'diamond',
  points: readonly Point[],
  style: ShapeStyle,
): void {
  boxFamily.render(bitmap, kind, points, style)
}

function painted(bitmap: Bitmap, x: number, y: number): boolean {
  return bitmap.get(x, y).a !== 0
}

function rotateAround(point: Point, centre: Point, angle: number): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - centre.x
  const dy = point.y - centre.y
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos }
}

describe('boxFamily rectangle', () => {
  it('exposes the eight box handles plus the rotate handle', () => {
    const handles = boxFamily.handles('rectangle', boxFamily.insert('rectangle', START, END))
    expect(handles.map((h) => h.id)).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'])
  })

  it('keeps the opposite corner fixed while resizing', () => {
    const resized = boxFamily.move('rectangle', boxFamily.insert('rectangle', START, END), 'nw', {
      x: 10,
      y: 8,
    })
    expect(resized).not.toBeNull()
    expect(normalizeRect(resized![0], resized![1])).toEqual({ x: 10, y: 8, width: 25, height: 27 })
    expect(resized!.some((p) => p.x === 34 && p.y === 34)).toBe(true)
  })

  it('returns null for an unknown handle', () => {
    const points = boxFamily.insert('rectangle', START, END)
    expect(boxFamily.move('rectangle', points, 'bogus', { x: 1, y: 1 })).toBeNull()
  })

  it('renders exactly like renderShape', () => {
    const points = boxFamily.insert('rectangle', START, END)
    const actual = new Bitmap(40, 40)
    render(actual, 'rectangle', points, BOTH)
    const expected = new Bitmap(40, 40)
    renderShape(expected, 'rectangle', [START, END], BOTH)
    expect(actual.data).toEqual(expected.data)
  })

  it('the rotate handle changes the rendered pixels', () => {
    const base = boxFamily.insert('rectangle', START, END)
    const rotated = boxFamily.move('rectangle', base, 'rotate', { x: 30, y: 10 })
    expect(rotated).not.toBeNull()

    const before = new Bitmap(60, 60)
    render(before, 'rectangle', base, BOTH)
    const after = new Bitmap(60, 60)
    render(after, 'rectangle', rotated!, BOTH)

    expect(after.data).not.toEqual(before.data)
  })

  it('keeps the angle and moves the correct local corner when resizing a rotated rectangle', () => {
    const base = boxFamily.insert('rectangle', START, END)
    const rotated = boxFamily.move('rectangle', base, 'rotate', { x: 30, y: 10 })!
    const angle = rotated[2].y
    expect(angle).toBeCloseTo(Math.PI / 4)

    const centre = { x: 20, y: 20 }
    const dragged = rotateAround({ x: 44, y: 44 }, centre, angle)
    const resized = boxFamily.move('rectangle', rotated, 'se', dragged)

    expect(resized).not.toBeNull()
    expect(resized![2]).toEqual({ x: 0, y: angle })
    expect(normalizeRect(resized![0], resized![1])).toEqual({ x: 5, y: 5, width: 40, height: 40 })
  })
})

describe('boxFamily diamond', () => {
  it('inserts the box corners plus a zeroed angle anchor', () => {
    expect(boxFamily.insert('diamond', START, END)).toEqual([START, END, { x: 0, y: 0 }])
  })

  it('exposes the eight box handles plus the rotate handle', () => {
    const handles = boxFamily.handles('diamond', boxFamily.insert('diamond', START, END))
    expect(handles.map((h) => h.id)).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'])
  })

  it('the rotate handle changes the rendered pixels', () => {
    const base = boxFamily.insert('diamond', START, END)
    const rotated = boxFamily.move('diamond', base, 'rotate', { x: 30, y: 10 })
    expect(rotated).not.toBeNull()

    const before = new Bitmap(60, 60)
    render(before, 'diamond', base, BOTH)
    const after = new Bitmap(60, 60)
    render(after, 'diamond', rotated!, BOTH)

    expect(after.data).not.toEqual(before.data)
  })
})

describe('boxFamily parity at angle zero', () => {
  for (const kind of BOX_KINDS) {
    it(`${kind} renders exactly like renderShape for square and non-square boxes`, () => {
      for (const end of [END, WIDE_END]) {
        const points = boxFamily.insert(kind, START, end)
        const actual = new Bitmap(60, 60)
        render(actual, kind as 'rectangle' | 'diamond', points, BOTH)
        const expected = new Bitmap(60, 60)
        renderShape(expected, kind, [START, end], BOTH)
        expect(actual.data).toEqual(expected.data)
      }
    })
  }
})

describe('boxFamily rounded rectangle', () => {
  it('inserts the default radius and rotation as the third anchor', () => {
    const points = boxFamily.insert('rounded-rectangle', START, END)
    expect(points).toHaveLength(3)
    const box = normalizeRect(START, END)
    const radius = Math.min(box.width, box.height) * 0.2
    expect(points[2]).toEqual({ x: radius, y: 0 })
  })

  it('exposes the eight box handles plus the rotate and radius handles', () => {
    const points = boxFamily.insert('rounded-rectangle', START, END)
    const ids = boxFamily.handles('rounded-rectangle', points).map((h) => h.id)
    expect(ids).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate', 'radius'])
  })

  it('the radius handle changes the drawn corner pixels', () => {
    const base = boxFamily.insert('rounded-rectangle', START, END)
    const grown = boxFamily.move('rounded-rectangle', base, 'radius', { x: 5 + 14, y: 5 + 14 })
    expect(grown).not.toBeNull()

    const small = new Bitmap(40, 40)
    render(small, 'rounded-rectangle', base, FILL_ONLY)
    const big = new Bitmap(40, 40)
    render(big, 'rounded-rectangle', grown!, FILL_ONLY)

    expect(big.data).not.toEqual(small.data)
    expect(painted(small, 8, 8)).toBe(true)
    expect(painted(big, 8, 8)).toBe(false)
  })

  it('renders exactly like renderShape at the default radius', () => {
    const square: Point[] = [START, END]
    const wide: Point[] = [{ x: 5, y: 5 }, { x: 44, y: 24 }]
    for (const anchors of [square, wide]) {
      const points = boxFamily.insert('rounded-rectangle', anchors[0], anchors[1])
      const actual = new Bitmap(50, 50)
      render(actual, 'rounded-rectangle', points, BOTH)
      const expected = new Bitmap(50, 50)
      renderShape(expected, 'rounded-rectangle', anchors, BOTH)
      expect(actual.data).toEqual(expected.data)
    }
  })
})

describe('boxFamily ellipse', () => {
  it('inserts center and half-axes from the box', () => {
    const points = boxFamily.insert('ellipse', START, END)
    expect(points).toHaveLength(2)
    const box = normalizeRect(START, END)
    expect(points[0]).toEqual({ x: box.x + (box.width - 1) / 2, y: box.y + (box.height - 1) / 2 })
    expect(points[1]).toEqual({ x: (box.width - 1) / 2, y: (box.height - 1) / 2 })
  })

  it('exposes the e, w, n and s handles', () => {
    const points = boxFamily.insert('ellipse', START, END)
    expect(boxFamily.handles('ellipse', points).map((h) => h.id)).toEqual(['e', 'w', 'n', 's'])
  })

  it('the e handle changes only rx', () => {
    const points = boxFamily.insert('ellipse', START, END)
    const moved = boxFamily.move('ellipse', points, 'e', { x: points[0].x + 20, y: points[0].y })
    expect(moved).not.toBeNull()
    expect(moved![0]).toEqual(points[0])
    expect(moved![1].x).toBeCloseTo(20)
    expect(moved![1].y).toBe(points[1].y)
  })

  it('renders exactly like renderShape', () => {
    const points = boxFamily.insert('ellipse', START, END)
    const actual = new Bitmap(40, 40)
    render(actual, 'ellipse', points, BOTH)
    const expected = new Bitmap(40, 40)
    renderShape(expected, 'ellipse', [START, END], BOTH)
    expect(actual.data).toEqual(expected.data)
  })
})
