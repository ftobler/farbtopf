import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, WHITE, rgba } from './color'

describe('Bitmap', () => {
  it('starts transparent', () => {
    const bitmap = new Bitmap(2, 3)
    expect(bitmap.get(0, 0)).toEqual(rgba(0, 0, 0, 0))
  })

  it('fills with a color', () => {
    const bitmap = new Bitmap(2, 2, WHITE)
    expect(bitmap.get(1, 1)).toEqual(WHITE)
  })

  it('reports bounds', () => {
    const bitmap = new Bitmap(3, 4)
    expect(bitmap.contains(2, 3)).toBe(true)
    expect(bitmap.contains(3, 3)).toBe(false)
    expect(bitmap.contains(-1, 0)).toBe(false)
  })

  it('ignores writes out of bounds', () => {
    const bitmap = new Bitmap(2, 2)
    bitmap.set(-1, 0, BLACK)
    bitmap.set(0, 5, BLACK)
    expect(bitmap.get(-1, 0)).toEqual(rgba(0, 0, 0, 0))
  })

  it('writes and reads fractional coordinates at the floored pixel', () => {
    const bitmap = new Bitmap(4, 4)
    bitmap.set(1.9, 2.4, BLACK)
    expect(bitmap.get(1, 2)).toEqual(BLACK)
    expect(bitmap.get(1.9, 2.4)).toEqual(BLACK)
    expect(bitmap.get(1.2, 2.8)).toEqual(BLACK)
    expect(bitmap.get(0, 2)).toEqual(rgba(0, 0, 0, 0))
  })

  it('agrees with contains at fractional coordinates', () => {
    const bitmap = new Bitmap(3, 4)
    expect(bitmap.contains(2, 3)).toBe(true)
    expect(bitmap.contains(2.9, 3.9)).toBe(true)
    expect(bitmap.contains(2.5, 3.5)).toBe(true)
    expect(bitmap.contains(3, 2)).toBe(false)
    expect(bitmap.contains(2.999, 4)).toBe(false)
    expect(bitmap.contains(-0.5, 0)).toBe(false)
    bitmap.set(2.5, 3.5, BLACK)
    expect(bitmap.get(2, 3)).toEqual(BLACK)
    bitmap.set(3, 2, BLACK)
    expect(bitmap.get(2, 2)).toEqual(rgba(0, 0, 0, 0))
  })

  it('treats non-finite coordinates as out of bounds', () => {
    const bitmap = new Bitmap(3, 3, WHITE)
    const before = bitmap.data.slice()
    const coords: readonly (readonly [number, number])[] = [
      [NaN, 1],
      [1, NaN],
      [Infinity, 1],
      [1, -Infinity],
    ]
    for (const [x, y] of coords) {
      expect(bitmap.contains(x, y)).toBe(false)
      expect(bitmap.get(x, y)).toEqual(rgba(0, 0, 0, 0))
      expect(() => bitmap.set(x, y, BLACK)).not.toThrow()
    }
    expect(bitmap.data).toEqual(before)
  })

  it('clones independently', () => {
    const bitmap = new Bitmap(2, 2, WHITE)
    const copy = bitmap.clone()
    copy.set(0, 0, BLACK)
    expect(bitmap.get(0, 0)).toEqual(WHITE)
    expect(copy.get(0, 0)).toEqual(BLACK)
  })

  it('round-trips through image data', () => {
    const bitmap = new Bitmap(2, 2)
    bitmap.set(1, 1, rgba(10, 20, 30, 200))
    const restored = Bitmap.fromImageData(bitmap.toImageData())
    expect(restored.width).toBe(2)
    expect(restored.height).toBe(2)
    expect(restored.get(1, 1)).toEqual(rgba(10, 20, 30, 200))
  })

  it('enforces a minimum size of one pixel', () => {
    const bitmap = new Bitmap(0, -5)
    expect(bitmap.width).toBe(1)
    expect(bitmap.height).toBe(1)
  })
})
