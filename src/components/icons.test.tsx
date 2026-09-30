import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BRUSH_SIZES } from '../core/tools'
import { strokePreviewWidth } from '../core/strokeWave'
import { StrokeSizeIcon, StrokeSizePreview } from './icons'

describe('StrokeSizeIcon', () => {
  it('draws exactly one sine wavelength: a crest then a trough across the icon', () => {
    const { container } = render(<StrokeSizeIcon />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('stroke-linecap')).toBe('round')
    const paths = svg.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    const d = paths[0].getAttribute('d')!
    // Absolute coordinates: start on the midline at the left, end on the midline at the right.
    expect(d).toMatch(/^M3 12C/)
    const segments = d.match(/[CS][^CS]*/g)!
    expect(segments).toHaveLength(2)
    const nums = (s: string) => s.slice(1).trim().split(/[ ,]+/).map(Number)
    const crest = nums(segments[0])
    const trough = nums(segments[1])
    // First half wave goes up (y < 12), ends back on the midline in the center.
    expect(crest[1]).toBeLessThan(12)
    expect(crest[4]).toBe(12)
    expect(crest[5]).toBe(12)
    // Second half wave goes down (y > 12) and ends on the midline at the right edge.
    expect(trough[1]).toBeGreaterThan(12)
    expect(trough[2]).toBe(21)
    expect(trough[3]).toBe(12)
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
