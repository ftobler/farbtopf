import { describe, expect, it } from 'vitest'
import { ZOOM_LEVELS, nextZoom } from './zoom'

describe('nextZoom', () => {
  it('steps up through the levels', () => {
    expect(nextZoom(1, 1)).toBe(2)
    expect(nextZoom(2, 1)).toBe(4)
  })

  it('steps down through the levels', () => {
    expect(nextZoom(1, -1)).toBe(0.5)
    expect(nextZoom(0.5, -1)).toBe(0.25)
  })

  it('clamps at the ends', () => {
    expect(nextZoom(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], 1)).toBe(8)
    expect(nextZoom(0.25, -1)).toBe(0.25)
  })

  it('resolves a custom zoom to the nearest step', () => {
    expect(nextZoom(1.5, 1)).toBe(2)
    expect(nextZoom(1.5, -1)).toBe(1)
  })
})
