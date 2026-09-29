import { describe, expect, it } from 'vitest'
import { computeScrollbarMetrics, panForScroll } from './scrollbars'

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
    expect(metrics.maxScroll).toBe(600)
    expect(metrics.scroll).toBe(300)
    expect(metrics.positionRatio).toBe(0.5)
    expect(metrics.thumbRatio).toBeCloseTo(0.4)
  })

  it('maps panning to the scroll offset and clamps at both ends', () => {
    expect(computeScrollbarMetrics(1000, 400, 300).scroll).toBe(0)
    expect(computeScrollbarMetrics(1000, 400, -300).scroll).toBe(600)
    expect(computeScrollbarMetrics(1000, 400, 900).scroll).toBe(0)
    expect(computeScrollbarMetrics(1000, 400, -900).scroll).toBe(600)
  })

  it('never reports a viewport longer than the content as a thumb bigger than the track', () => {
    expect(computeScrollbarMetrics(1000, 400, 0).thumbRatio).toBeLessThan(1)
    expect(computeScrollbarMetrics(0, 400, 0).thumbRatio).toBe(1)
  })
})

describe('panForScroll', () => {
  it('is the inverse of the metrics scroll offset', () => {
    expect(panForScroll(1000, 400, 0)).toBe(300)
    expect(panForScroll(1000, 400, 600)).toBe(-300)
    expect(panForScroll(1000, 400, 300)).toBe(0)
  })

  it('round-trips through the metrics', () => {
    const { scroll } = computeScrollbarMetrics(1600, 700, -220)
    expect(panForScroll(1600, 700, scroll)).toBeCloseTo(-220)
  })
})
