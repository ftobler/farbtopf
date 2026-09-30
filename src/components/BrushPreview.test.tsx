import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BLACK } from '../core/color'
import { TIP_PADDING } from '../core/brushTip'
import { BrushPreview } from './BrushPreview'

describe('BrushPreview', () => {
  it('shows the tip at its true on-canvas size for the zoom', () => {
    const { container } = render(
      <BrushPreview tool="brush" brush="round" size={12} opacity={100} color={BLACK} zoom={2} />,
    )
    const preview = container.querySelector<HTMLElement>('.brush-preview')
    expect(preview).toBeTruthy()
    expect(preview?.getAttribute('aria-hidden')).toBe('true')
    expect(preview?.style.width).toBe('24px')
    expect(preview?.style.height).toBe('24px')
    expect(preview?.dataset.tip).toBe('round')
    const canvas = preview?.querySelector<HTMLCanvasElement>('canvas.brush-preview-tip')
    expect(canvas?.width).toBe(12 + 2 * TIP_PADDING)
    expect(canvas?.style.width).toBe(`${(12 + 2 * TIP_PADDING) * 2}px`)
    expect(canvas?.style.left).toBe(`${-TIP_PADDING * 2}px`)
  })

  it('shows the opacity', () => {
    const { container } = render(
      <BrushPreview tool="pencil" brush="round" size={3} opacity={35} color={BLACK} zoom={1} />,
    )
    const preview = container.querySelector<HTMLElement>('.brush-preview')
    expect(preview?.style.opacity).toBe('0.35')
    expect(preview?.dataset.tip).toBe('square')
  })

  it('follows the brush form', () => {
    const { container, rerender } = render(
      <BrushPreview tool="brush" brush="calligraphy" size={20} opacity={100} color={BLACK} zoom={1} />,
    )
    expect(container.querySelector<HTMLElement>('.brush-preview')?.dataset.tip).toBe('calligraphy')
    rerender(<BrushPreview tool="eraser" brush="calligraphy" size={20} opacity={100} color={BLACK} zoom={1} />)
    expect(container.querySelector<HTMLElement>('.brush-preview')?.dataset.tip).toBe('square')
  })

  it('outlines the reach of a distorting brush instead of painting a tip', () => {
    const { container } = render(
      <BrushPreview tool="brush" brush="smudge" size={40} opacity={60} color={BLACK} zoom={0.5} />,
    )
    const preview = container.querySelector<HTMLElement>('.brush-preview')
    expect(preview?.dataset.tip).toBe('area')
    expect(preview?.style.width).toBe('20px')
    expect(preview?.querySelector('canvas')).toBeNull()
    expect(preview?.querySelector('.brush-preview-area')).toBeTruthy()
  })
})
