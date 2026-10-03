import { describe, expect, it } from 'vitest'
import { FILL_CURSOR, PENCIL_CURSOR } from './cursors'

const CURSOR = /^url\("data:image\/svg\+xml,([^"]+)"\) (\d+) (\d+), crosshair$/

function parse(cursor: string) {
  const match = CURSOR.exec(cursor)
  if (!match) throw new Error(`not an SVG cursor with a hotspot and fallback: ${cursor}`)
  const svg = new DOMParser().parseFromString(decodeURIComponent(match[1]), 'image/svg+xml').documentElement
  return { svg, x: Number(match[2]), y: Number(match[3]) }
}

describe.each([
  ['pencil', PENCIL_CURSOR],
  ['fill', FILL_CURSOR],
])('the %s cursor', (_name, cursor) => {
  it('is an inline 32×32 SVG with a crosshair fallback', () => {
    const { svg } = parse(cursor)
    expect(svg.nodeName).toBe('svg')
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
  })

  it('has its hotspot inside the image', () => {
    const { x, y } = parse(cursor)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThan(32)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThan(32)
  })

  it('draws a light halo under a dark outline, so it shows on any image and theme', () => {
    const { svg } = parse(cursor)
    const strokes = Array.from(svg.querySelectorAll('[stroke]')).map((node) => node.getAttribute('stroke'))
    expect(strokes).toContain('#fff')
    expect(strokes).toContain('#000')
  })
})

describe('cursor hotspots', () => {
  it('sits on the pencil tip, at the bottom left', () => {
    const { x, y } = parse(PENCIL_CURSOR)
    expect(x).toBeLessThan(6)
    expect(y).toBeGreaterThan(26)
  })

  it('sits on the paint dripping from the bucket, at the bottom', () => {
    const { y } = parse(FILL_CURSOR)
    expect(y).toBeGreaterThan(26)
  })
})
