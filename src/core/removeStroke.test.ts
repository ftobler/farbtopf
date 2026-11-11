import { describe, expect, it } from 'vitest'
import { regionUnchanged, stampStroke, writeRegion } from './removeStroke'
import { Bitmap } from './bitmap'

const rows = (mask: Uint8Array, width: number) =>
  Array.from({ length: mask.length / width }, (_, y) =>
    Array.from(mask.slice(y * width, (y + 1) * width), (v) => (v ? '#' : '.')).join(''),
  )

describe('stampStroke', () => {
  it('marks the pixels whose centre lies within half the size of the segment, with round ends', () => {
    const mask = new Uint8Array(9 * 5)
    const dirty = stampStroke(mask, 9, 5, { x: 2, y: 2 }, { x: 6, y: 2 }, 3)
    expect(rows(mask, 9)).toEqual(['.........', '.#######.', '.#######.', '.#######.', '.........'])
    expect(dirty).toEqual({ x: 1, y: 1, width: 7, height: 3 })
  })

  it('stamps a round dot for a click, and at least one pixel at size 1', () => {
    const mask = new Uint8Array(7 * 7)
    stampStroke(mask, 7, 7, { x: 3, y: 3 }, { x: 3, y: 3 }, 5)
    expect(rows(mask, 7)).toEqual(['.......', '..###..', '.#####.', '.#####.', '.#####.', '..###..', '.......'])
    const one = new Uint8Array(4 * 4)
    stampStroke(one, 4, 4, { x: 1, y: 2 }, { x: 1, y: 2 }, 1)
    expect(Array.from(one).filter(Boolean)).toHaveLength(1)
    expect(one[2 * 4 + 1]).toBe(1)
  })

  it('clips to the canvas and returns null when nothing lands on it', () => {
    const mask = new Uint8Array(5 * 5)
    expect(stampStroke(mask, 5, 5, { x: -1, y: 0 }, { x: -1, y: 4 }, 3)).toEqual({ x: 0, y: 0, width: 1, height: 5 })
    expect(stampStroke(new Uint8Array(25), 5, 5, { x: 40, y: 40 }, { x: 50, y: 40 }, 3)).toBeNull()
  })
})

describe('writeRegion and regionUnchanged', () => {
  it('copies RGBA bytes into a rectangle of the bitmap', () => {
    const bitmap = new Bitmap(3, 2, { r: 0, g: 0, b: 0, a: 255 })
    writeRegion(bitmap, { x: 1, y: 0, width: 2, height: 1 }, new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(bitmap.get(1, 0)).toEqual({ r: 1, g: 2, b: 3, a: 4 })
    expect(bitmap.get(2, 0)).toEqual({ r: 5, g: 6, b: 7, a: 8 })
    expect(bitmap.get(0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 255 })
  })

  it('tells whether two bitmaps hold the same bytes inside a rectangle', () => {
    const a = new Bitmap(4, 4, { r: 9, g: 9, b: 9, a: 255 })
    const b = a.clone()
    b.set(3, 3, { r: 0, g: 0, b: 0, a: 255 })
    expect(regionUnchanged(a, b, { x: 0, y: 0, width: 3, height: 3 })).toBe(true)
    expect(regionUnchanged(a, b, { x: 2, y: 2, width: 2, height: 2 })).toBe(false)
    expect(regionUnchanged(a, new Bitmap(5, 4), { x: 0, y: 0, width: 1, height: 1 })).toBe(false)
  })
})
