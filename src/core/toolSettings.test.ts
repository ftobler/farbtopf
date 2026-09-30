import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOOL_SETTINGS,
  MAX_OPACITY,
  MAX_SIZE,
  MIN_OPACITY,
  MIN_SIZE,
  SIZED_TOOLS,
  clampOpacity,
  clampSize,
  isSizedTool,
  opacityToSlider,
  sizeToSlider,
  sliderToOpacity,
  sliderToSize,
  stepSize,
} from './toolSettings'
import { BRUSH_SIZES, TOOLS } from './tools'

describe('sized tools', () => {
  it('covers the pencil, brushes, airbrush, eraser and shapes', () => {
    expect([...SIZED_TOOLS].sort()).toEqual(['airbrush', 'brush', 'eraser', 'pencil', 'shape'])
    for (const tool of TOOLS) expect(isSizedTool(tool.id)).toBe(SIZED_TOOLS.includes(tool.id as never))
  })

  it('leaves selection, fill, picker, text and zoom unsized', () => {
    for (const id of ['select', 'fill', 'picker', 'text', 'zoom'] as const) expect(isSizedTool(id)).toBe(false)
  })

  it('gives every sized tool a default size and full opacity', () => {
    for (const tool of SIZED_TOOLS) {
      expect(DEFAULT_TOOL_SETTINGS[tool].opacity).toBe(100)
      expect(BRUSH_SIZES).toContain(DEFAULT_TOOL_SETTINGS[tool].size)
    }
    expect(DEFAULT_TOOL_SETTINGS.pencil.size).toBe(1)
    expect(DEFAULT_TOOL_SETTINGS.brush.size).toBe(4)
  })
})

describe('clamping', () => {
  it('keeps sizes to whole pixels between 1 and 500', () => {
    expect(MIN_SIZE).toBe(1)
    expect(MAX_SIZE).toBe(500)
    expect(clampSize(0)).toBe(1)
    expect(clampSize(-7)).toBe(1)
    expect(clampSize(12.4)).toBe(12)
    expect(clampSize(12.6)).toBe(13)
    expect(clampSize(9999)).toBe(500)
    expect(clampSize(Number.NaN)).toBe(1)
  })

  it('keeps opacity to whole percents between 1 and 100', () => {
    expect(MIN_OPACITY).toBe(1)
    expect(MAX_OPACITY).toBe(100)
    expect(clampOpacity(0)).toBe(1)
    expect(clampOpacity(55.5)).toBe(56)
    expect(clampOpacity(250)).toBe(100)
    expect(clampOpacity(Number.NaN)).toBe(100)
  })
})

describe('logarithmic size slider', () => {
  it('maps the ends of the track to 1 px and 500 px', () => {
    expect(sliderToSize(0)).toBe(1)
    expect(sliderToSize(1)).toBe(500)
    expect(sizeToSlider(1)).toBe(0)
    expect(sizeToSlider(500)).toBe(1)
  })

  it('clamps positions outside the track', () => {
    expect(sliderToSize(-0.5)).toBe(1)
    expect(sliderToSize(1.5)).toBe(500)
  })

  it('always yields whole pixels', () => {
    for (let i = 0; i <= 200; i += 1) {
      const size = sliderToSize(i / 200)
      expect(Number.isInteger(size)).toBe(true)
    }
  })

  it('is monotonic', () => {
    let last = 0
    for (let i = 0; i <= 1000; i += 1) {
      const size = sliderToSize(i / 1000)
      expect(size).toBeGreaterThanOrEqual(last)
      last = size
    }
  })

  it('spends much more of the track on small sizes than a linear slider', () => {
    // A linear slider would put 10 px at 1.8% of the track.
    expect(sizeToSlider(10)).toBeGreaterThan(0.3)
    expect(sizeToSlider(2)).toBeGreaterThan(0.1)
    // The middle of the track is a medium brush, not 250 px.
    const middle = sliderToSize(0.5)
    expect(middle).toBeGreaterThan(15)
    expect(middle).toBeLessThan(30)
  })

  it('round-trips every whole size', () => {
    for (let size = MIN_SIZE; size <= MAX_SIZE; size += 1) {
      expect(sliderToSize(sizeToSlider(size))).toBe(size)
    }
  })

  it('puts every preset exactly where its slider position maps back to it', () => {
    for (const preset of BRUSH_SIZES) expect(sliderToSize(sizeToSlider(preset))).toBe(preset)
  })

  it('clamps sizes outside the range to the ends of the track', () => {
    expect(sizeToSlider(0)).toBe(0)
    expect(sizeToSlider(4000)).toBe(1)
  })
})

describe('linear opacity slider', () => {
  it('maps the track to 1..100 %', () => {
    expect(sliderToOpacity(0)).toBe(1)
    expect(sliderToOpacity(1)).toBe(100)
    expect(sliderToOpacity(0.5)).toBe(51)
    expect(opacityToSlider(100)).toBe(1)
    expect(opacityToSlider(1)).toBe(0)
  })

  it('round-trips every whole percent', () => {
    for (let opacity = 1; opacity <= 100; opacity += 1) {
      expect(sliderToOpacity(opacityToSlider(opacity))).toBe(opacity)
    }
  })
})

describe('stepSize', () => {
  it('steps through the presets', () => {
    expect(stepSize(4, 1)).toBe(5)
    expect(stepSize(5, -1)).toBe(4)
    expect(stepSize(1, -1)).toBe(1)
  })

  it('snaps an in-between size to the neighbouring preset', () => {
    expect(stepSize(6, 1)).toBe(8)
    expect(stepSize(6, -1)).toBe(5)
  })

  it('keeps growing past the largest preset up to 500 px', () => {
    const largest = BRUSH_SIZES[BRUSH_SIZES.length - 1]
    let size: number = largest
    const seen: number[] = []
    for (let i = 0; i < 40; i += 1) {
      const next = stepSize(size, 1)
      if (next === size) break
      expect(next).toBeGreaterThan(size)
      size = next
      seen.push(size)
    }
    expect(size).toBe(500)
    expect(stepSize(500, 1)).toBe(500)
    // ...and comes back down to the presets.
    let down = 500
    for (let i = 0; i < 40 && down > largest; i += 1) down = stepSize(down, -1)
    expect(down).toBe(largest)
    expect(seen.length).toBeGreaterThan(3)
  })
})
