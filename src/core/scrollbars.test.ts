import { describe, expect, it } from 'vitest'
import { SCROLL_OVERSCROLL, computeScrollbarMetrics, panForScroll } from './scrollbars'

describe('computeScrollbarMetrics', () => {
  it('marks an axis as not scrollable when the content fits', () => {
    const metrics = computeScrollbarMetrics(400, 800, 0)
    expect(metrics.scrollable).toBe(false)
    expect(metrics.maxScroll).toBe(0)
    expect(metrics.scroll).toBe(0)
    expect(metrics.thumbRatio).toBe(1)
    expect(metrics.positionRatio).toBe(0)
  })

  it('treats content equal to the viewport as not scrollable', () => {
    const metrics = computeScrollbarMetrics(800, 800, 0)
    expect(metrics.scrollable).toBe(false)
    expect(metrics.maxScroll).toBe(0)
    expect(metrics.thumbRatio).toBe(1)
  })

  it('centres the thumb when the content is larger and not panned', () => {
    const metrics = computeScrollbarMetrics(1000, 400, 0)
    expect(metrics.scrollable).toBe(true)
    expect(metrics.maxScroll).toBe(640)
    expect(metrics.scroll).toBe(320)
    expect(metrics.positionRatio).toBe(0.5)
    expect(metrics.thumbRatio).toBeCloseTo(400 / 1040)
  })

  it('lets the canvas travel one overscroll past each edge at the limits', () => {
    const start = computeScrollbarMetrics(1000, 400, 320)
    expect(start.scroll).toBe(0)
    // Canvas left edge sits one overscroll (20px) inside the viewport start.
    expect(400 / 2 - 1000 / 2 + panForScroll(1000, 400, start.scroll)).toBe(SCROLL_OVERSCROLL)
    const end = computeScrollbarMetrics(1000, 400, -320)
    expect(end.scroll).toBe(end.maxScroll)
    // Canvas right edge sits one overscroll (20px) inside the viewport end.
    expect(400 / 2 + 1000 / 2 + panForScroll(1000, 400, end.scroll)).toBe(400 - SCROLL_OVERSCROLL)
  })

  it('maps panning to the scroll offset and clamps at both ends', () => {
    expect(computeScrollbarMetrics(1000, 400, 300).scroll).toBe(20)
    expect(computeScrollbarMetrics(1000, 400, -300).scroll).toBe(620)
    expect(computeScrollbarMetrics(1000, 400, 900).scroll).toBe(0)
    expect(computeScrollbarMetrics(1000, 400, -900).scroll).toBe(640)
  })

  it('never reports a viewport longer than the content as a thumb bigger than the track', () => {
    expect(computeScrollbarMetrics(1000, 400, 0).thumbRatio).toBeLessThan(1)
    expect(computeScrollbarMetrics(0, 400, 0).thumbRatio).toBe(1)
  })
})

describe('panForScroll', () => {
  it('is the inverse of the metrics scroll offset', () => {
    expect(panForScroll(1000, 400, 0)).toBe(320)
    expect(panForScroll(1000, 400, 600)).toBe(-280)
    expect(panForScroll(1000, 400, 300)).toBe(20)
  })

  it('round-trips through the metrics', () => {
    const { scroll } = computeScrollbarMetrics(1600, 700, -220)
    expect(panForScroll(1600, 700, scroll)).toBeCloseTo(-220)
  })
})
