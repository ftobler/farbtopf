import { describe, expect, it } from 'vitest'
import { ZOOM_LEVELS, backingScale, displayZoom, nearestZoomIndex, nextZoom } from './zoom'

describe('nextZoom', () => {
  it('steps up through the levels', () => {
    expect(nextZoom(1, 1)).toBe(1.5)
    expect(nextZoom(2, 1)).toBe(3)
  })

  it('steps up past 800% to 1600%', () => {
    expect(nextZoom(8, 1)).toBe(12)
    expect(nextZoom(12, 1)).toBe(16)
    expect(nextZoom(16, 1)).toBe(16)
  })

  it('steps down from 1600%', () => {
    expect(nextZoom(16, -1)).toBe(12)
    expect(nextZoom(12, -1)).toBe(8)
  })

  it('steps down through the levels', () => {
    expect(nextZoom(1, -1)).toBe(0.75)
    expect(nextZoom(0.5, -1)).toBe(0.25)
  })

  it('clamps at the ends', () => {
    expect(nextZoom(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], 1)).toBe(16)
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
    expect(nearestZoomIndex(16)).toBe(ZOOM_LEVELS.indexOf(16))
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

describe('displayZoom', () => {
  it('leaves every level alone on a whole-number pixel ratio', () => {
    for (const level of ZOOM_LEVELS) {
      expect(displayZoom(level, 1)).toBe(level)
      expect(displayZoom(level, 2)).toBe(level)
    }
  })

  it('snaps whole-number levels to whole device pixels on a fractional ratio', () => {
    // Windows at 125%: 100% shows one physical pixel per image pixel.
    expect(displayZoom(1, 1.25) * 1.25).toBe(1)
    expect(displayZoom(4, 1.25) * 1.25).toBe(5)
    expect(displayZoom(2, 1.5) * 1.5).toBe(3)
  })

  it('keeps fractional levels as they are', () => {
    expect(displayZoom(1.5, 1.25)).toBe(1.5)
    expect(displayZoom(0.5, 1.25)).toBe(0.5)
  })
})

describe('backingScale', () => {
  it('matches a whole-number pixel ratio', () => {
    expect(backingScale(1)).toBe(1)
    expect(backingScale(2)).toBe(2)
  })

  it('uses the bitmap size on a fractional ratio so no rows get stretched', () => {
    expect(backingScale(1.25)).toBe(1)
    expect(backingScale(1.5)).toBe(1)
  })
})
