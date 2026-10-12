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
  it('is the nominal level when the ratio is one', () => {
    for (const level of ZOOM_LEVELS) expect(displayZoom(level, 1)).toBe(level)
  })

  it('divides by the ratio so one image pixel stays one physical pixel', () => {
    // Browser zoom to 200% on a 1x display: a 100% level lays out half as wide
    // in CSS pixels so it still covers one physical pixel per image pixel.
    expect(displayZoom(1, 2)).toBe(0.5)
    expect(displayZoom(1, 2) * 2).toBe(1)
    expect(displayZoom(4, 2.5) * 2.5).toBe(4)
  })

  it('leaves the level alone for a non-positive ratio', () => {
    expect(displayZoom(2, 0)).toBe(2)
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
