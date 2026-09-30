import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StrokeSizeIcon } from './icons'

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
