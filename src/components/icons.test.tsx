import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BRUSH_SIZES } from '../core/tools'
import { strokePreviewWidth } from '../core/strokeWave'
import { StrokeSizeIcon, StrokeSizePreview } from './icons'

describe('StrokeSizeIcon', () => {
  const nums = (s: string) => s.match(/-?[\d.]+/g)!.map(Number)

  it('is a wide icon, twice as wide as it is tall', () => {
    const { container } = render(<StrokeSizeIcon size={18} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 48 24')
    expect(svg.getAttribute('width')).toBe('36')
    expect(svg.getAttribute('height')).toBe('18')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('stroke-linecap')).toBe('round')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('stacks a thin wave above a thicker one, each exactly one wavelength', () => {
    const { container } = render(<StrokeSizeIcon />)
    const paths = [...container.querySelectorAll('path')]
    expect(paths).toHaveLength(2)
    const [thin, thick] = paths.map((path) => {
      const d = path.getAttribute('d')!
      const segments = d.match(/[CS][^CS]*/g)!
      // One crest (first curve pulls up) and one trough (second pulls down).
      expect(segments).toHaveLength(2)
      const [x0, cy] = nums(d)
      const crest = nums(segments[0])
      const trough = nums(segments[1])
      expect(crest[1]).toBeLessThan(cy)
      expect(crest[5]).toBe(cy)
      expect(trough[1]).toBeGreaterThan(cy)
      expect(trough[3]).toBe(cy)
      return { x0, x1: trough[2], cy, amp: (trough[1] - cy) * 0.75, width: Number(path.getAttribute('stroke-width')) }
    })
    expect(thick.width).toBeGreaterThan(thin.width * 2)
    expect(thin.cy).toBeLessThan(thick.cy)
    // A visible gap separates the waves, and neither is clipped by the 48x24 box.
    expect(thin.cy + thin.amp + thin.width / 2).toBeLessThan(thick.cy - thick.amp - thick.width / 2)
    for (const wave of [thin, thick]) {
      expect(wave.cy - wave.amp - wave.width / 2).toBeGreaterThanOrEqual(0)
      expect(wave.cy + wave.amp + wave.width / 2).toBeLessThanOrEqual(24)
      expect(wave.x0 - wave.width / 2).toBeGreaterThanOrEqual(0)
      expect(wave.x1 + wave.width / 2).toBeLessThanOrEqual(48)
      expect(wave.x1 - wave.x0).toBeGreaterThan(32)
    }
  })
})

describe('StrokeSizePreview', () => {
  it('keeps every wave, including its round caps, inside the preview box', () => {
    for (const size of BRUSH_SIZES) {
      const { container, unmount } = render(<StrokeSizePreview size={size} />)
      const svg = container.querySelector('svg.size-wave')!
      const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number)
      const path = svg.querySelector('path')!
      const stroke = Number(path.getAttribute('stroke-width'))
      expect(stroke).toBe(strokePreviewWidth(size))
      const nums = path.getAttribute('d')!.match(/-?[\d.]+/g)!.map(Number)
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      // Bezier peaks reach 3/4 of the way to the control points.
      const cy = h / 2
      const reach = (Math.max(...ys) - cy) * 0.75
      expect(cy - reach - stroke / 2).toBeGreaterThanOrEqual(0)
      expect(cy + reach + stroke / 2).toBeLessThanOrEqual(h)
      expect(Math.min(...xs) - stroke / 2).toBeGreaterThanOrEqual(0)
      expect(Math.max(...xs) + stroke / 2).toBeLessThanOrEqual(w)
      unmount()
    }
  })
})
