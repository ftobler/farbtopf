import { describe, expect, it } from 'vitest'
import {
  clampPoint,
  distance,
  floorPoint,
  normalizeRect,
  pointInRect,
  rectFromSize,
  rectsEqual,
} from './geometry'

describe('normalizeRect', () => {
  it('creates a rect from top-left to bottom-right', () => {
    expect(normalizeRect({ x: 1, y: 2 }, { x: 4, y: 6 })).toEqual({
      x: 1,
      y: 2,
      width: 4,
      height: 5,
    })
  })

  it('normalizes reversed corners', () => {
    expect(normalizeRect({ x: 4, y: 6 }, { x: 1, y: 2 })).toEqual({
      x: 1,
      y: 2,
      width: 4,
      height: 5,
    })
  })

  it('is one pixel for a single point', () => {
    expect(normalizeRect({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({
      x: 3,
      y: 3,
      width: 1,
      height: 1,
    })
  })
})

describe('rectFromSize', () => {
  it('builds a normalized rect', () => {
    expect(rectFromSize({ x: 2, y: 2 }, 3, 4)).toEqual({ x: 2, y: 2, width: 3, height: 4 })
  })
})

describe('pointInRect', () => {
  const rect = { x: 0, y: 0, width: 3, height: 3 }

  it('includes the top-left edge', () => {
    expect(pointInRect({ x: 0, y: 0 }, rect)).toBe(true)
  })

  it('excludes the bottom-right edge', () => {
    expect(pointInRect({ x: 3, y: 3 }, rect)).toBe(false)
  })
})

describe('clampPoint', () => {
  it('clamps into bounds', () => {
    expect(clampPoint({ x: -5, y: 99 }, 10, 10)).toEqual({ x: 0, y: 9 })
  })

  it('floors fractional coordinates', () => {
    expect(clampPoint({ x: 2.9, y: 3.1 }, 10, 10)).toEqual({ x: 2, y: 3 })
  })
})

describe('floorPoint', () => {
  it('snaps to the pixel grid without clamping to any bounds', () => {
    expect(floorPoint({ x: -0.5, y: 99.7 })).toEqual({ x: -1, y: 99 })
    expect(floorPoint({ x: 2.9, y: 3.1 })).toEqual({ x: 2, y: 3 })
  })
})

describe('rectsEqual', () => {
  it('compares all fields', () => {
    expect(rectsEqual({ x: 1, y: 1, width: 1, height: 1 }, { x: 1, y: 1, width: 1, height: 1 })).toBe(
      true,
    )
    expect(rectsEqual({ x: 1, y: 1, width: 1, height: 1 }, { x: 1, y: 1, width: 1, height: 2 })).toBe(
      false,
    )
  })
})

describe('distance', () => {
  it('uses euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})
