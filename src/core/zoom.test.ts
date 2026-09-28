import { describe, expect, it } from 'vitest'
import { ZOOM_LEVELS, nearestZoomIndex, nextZoom } from './zoom'

describe('nextZoom', () => {
  it('steps up through the levels', () => {
    expect(nextZoom(1, 1)).toBe(1.5)
    expect(nextZoom(2, 1)).toBe(3)
  })

  it('steps down through the levels', () => {
    expect(nextZoom(1, -1)).toBe(0.75)
    expect(nextZoom(0.5, -1)).toBe(0.25)
  })

  it('clamps at the ends', () => {
    expect(nextZoom(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], 1)).toBe(8)
    expect(nextZoom(0.25, -1)).toBe(0.25)
  })

  it('resolves a custom zoom to the nearest step', () => {
    expect(nextZoom(1.1, 1)).toBe(1.5)
    expect(nextZoom(1.1, -1)).toBe(1)
  })
})

describe('nearestZoomIndex', () => {
  it('returns the index of an exact level', () => {
    expect(nearestZoomIndex(1)).toBe(ZOOM_LEVELS.indexOf(1))
    expect(nearestZoomIndex(4)).toBe(ZOOM_LEVELS.indexOf(4))
  })

  it('snaps a custom zoom to the closest level', () => {
    expect(nearestZoomIndex(1.6)).toBe(ZOOM_LEVELS.indexOf(1.5))
    expect(nearestZoomIndex(0.3)).toBe(ZOOM_LEVELS.indexOf(0.25))
  })

  it('clamps beyond the ends', () => {
    expect(nearestZoomIndex(0.01)).toBe(0)
    expect(nearestZoomIndex(100)).toBe(ZOOM_LEVELS.length - 1)
  })
})
