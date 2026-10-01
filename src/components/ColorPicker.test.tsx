import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColorPicker } from './ColorPicker'
import type { Rgba } from '../core/color'

const black: Rgba = { r: 0, g: 0, b: 0, a: 255 }

function renderPicker() {
  render(
    <ColorPicker
      color={black}
      target="primary"
      customColors={[]}
      onTargetChange={vi.fn()}
      onColorChange={vi.fn()}
      onAddCustomColor={vi.fn()}
      onRemoveCustomColor={vi.fn()}
    />,
  )
}

describe('ColorPicker', () => {
  it('shows a palette icon on the custom color trigger', () => {
    renderPicker()
    const trigger = screen.getByRole('button', { name: 'Custom colors' })
    expect(trigger.querySelector('svg')).toBeTruthy()
    expect(trigger.getAttribute('title')).toBe('Custom colors')
    expect(trigger.classList.contains('color-picker-trigger')).toBe(true)
  })

  it('draws the trigger icon at a large size', () => {
    renderPicker()
    const icon = screen.getByRole('button', { name: 'Custom colors' }).querySelector('svg')
    expect(icon?.getAttribute('width')).toBe('26')
  })

  it('opens the color picker dialog from the trigger', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Custom colors' }))
    expect(screen.getByRole('dialog', { name: 'Color picker' })).toBeTruthy()
  })

  it('adjusts saturation and value with the arrow keys', () => {
    const onColorChange = vi.fn()
    render(
      <ColorPicker
        color={black}
        target="primary"
        customColors={[]}
        onTargetChange={vi.fn()}
        onColorChange={onColorChange}
        onAddCustomColor={vi.fn()}
        onRemoveCustomColor={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Custom colors' }))
    const area = screen.getByRole('slider', { name: 'Saturation and value' })
    fireEvent.keyDown(area, { key: 'ArrowRight' })
    expect(onColorChange).toHaveBeenCalledTimes(1)
    const first = onColorChange.mock.calls[0][0] as Rgba
    fireEvent.keyDown(area, { key: 'ArrowUp' })
    const second = onColorChange.mock.calls[1][0] as Rgba
    expect(second.g).toBeGreaterThanOrEqual(first.g)
  })

  describe('saturation and value area', () => {
    function openArea(rect: { left: number; top: number; width: number; height: number }) {
      const onColorChange = vi.fn()
      render(
        <ColorPicker
          color={black}
          target="primary"
          customColors={[]}
          onTargetChange={vi.fn()}
          onColorChange={onColorChange}
          onAddCustomColor={vi.fn()}
          onRemoveCustomColor={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Custom colors' }))
      const area = screen.getByRole('slider', { name: 'Saturation and value' })
      area.getBoundingClientRect = () =>
        ({
          x: rect.left,
          y: rect.top,
          left: rect.left,
          top: rect.top,
          right: rect.left + rect.width,
          bottom: rect.top + rect.height,
          width: rect.width,
          height: rect.height,
          toJSON: () => ({}),
        }) as DOMRect
      area.setPointerCapture = vi.fn()
      return { area, onColorChange }
    }

    it('picks full saturation and value at the top right corner', () => {
      const { area, onColorChange } = openArea({ left: 10, top: 20, width: 100, height: 100 })
      fireEvent.pointerDown(area, { clientX: 110, clientY: 20, pointerId: 1 })
      expect(onColorChange).toHaveBeenLastCalledWith({ r: 255, g: 0, b: 0, a: 255 })
      expect(area.getAttribute('aria-valuetext')).toBe('Saturation 100%, value 100%')
    })

    it('maps the pointer position inside the area to saturation and value', () => {
      const { area } = openArea({ left: 10, top: 20, width: 100, height: 100 })
      fireEvent.pointerDown(area, { clientX: 35, clientY: 45, pointerId: 1 })
      expect(area.getAttribute('aria-valuetext')).toBe('Saturation 25%, value 75%')
    })

    it('clamps positions outside the area to its edges', () => {
      const { area, onColorChange } = openArea({ left: 10, top: 20, width: 100, height: 100 })
      fireEvent.pointerDown(area, { clientX: 500, clientY: -500, pointerId: 1 })
      expect(onColorChange).toHaveBeenLastCalledWith({ r: 255, g: 0, b: 0, a: 255 })
      fireEvent.pointerMove(area, { clientX: -500, clientY: 500, buttons: 1, pointerId: 1 })
      expect(onColorChange).toHaveBeenLastCalledWith({ r: 0, g: 0, b: 0, a: 255 })
      expect(area.getAttribute('aria-valuetext')).toBe('Saturation 0%, value 0%')
    })

    it('follows a drag but ignores hovering without a pressed button', () => {
      const { area, onColorChange } = openArea({ left: 0, top: 0, width: 100, height: 100 })
      fireEvent.pointerMove(area, { clientX: 100, clientY: 0, buttons: 0, pointerId: 1 })
      expect(onColorChange).not.toHaveBeenCalled()
      fireEvent.pointerMove(area, { clientX: 100, clientY: 0, buttons: 1, pointerId: 1 })
      expect(onColorChange).toHaveBeenLastCalledWith({ r: 255, g: 0, b: 0, a: 255 })
    })

    it('ignores pointer input while the area has no size', () => {
      const { area, onColorChange } = openArea({ left: 0, top: 0, width: 0, height: 0 })
      fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 })
      expect(onColorChange).not.toHaveBeenCalled()
    })
  })

  describe('sliders', () => {
    const red: Rgba = { r: 255, g: 0, b: 0, a: 255 }

    function openWith(color: Rgba) {
      const onColorChange = vi.fn()
      render(
        <ColorPicker
          color={color}
          target="primary"
          customColors={[]}
          onTargetChange={vi.fn()}
          onColorChange={onColorChange}
          onAddCustomColor={vi.fn()}
          onRemoveCustomColor={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Custom colors' }))
      return onColorChange
    }

    it('changes the hue and keeps saturation, value and alpha', () => {
      const onColorChange = openWith({ ...red, a: 200 })
      fireEvent.change(screen.getByRole('slider', { name: 'Hue' }), { target: { value: '120' } })
      expect(onColorChange).toHaveBeenLastCalledWith({ r: 0, g: 255, b: 0, a: 200 })
      expect((screen.getByLabelText('Hex color') as HTMLInputElement).value).toBe('#00ff00c8')
      expect((screen.getByLabelText('Green') as HTMLInputElement).value).toBe('255')
    })

    it('changes the alpha and shows it in the hex text', () => {
      const onColorChange = openWith(red)
      fireEvent.change(screen.getByRole('slider', { name: 'Alpha' }), { target: { value: '128' } })
      expect(onColorChange).toHaveBeenLastCalledWith({ r: 255, g: 0, b: 0, a: 128 })
      expect((screen.getByLabelText('Hex color') as HTMLInputElement).value).toBe('#ff000080')
    })

    it('drops the alpha suffix from the hex text when alpha is back at full', () => {
      const onColorChange = openWith({ ...red, a: 64 })
      expect((screen.getByLabelText('Hex color') as HTMLInputElement).value).toBe('#ff000040')
      fireEvent.change(screen.getByRole('slider', { name: 'Alpha' }), { target: { value: '255' } })
      expect(onColorChange).toHaveBeenLastCalledWith(red)
      expect((screen.getByLabelText('Hex color') as HTMLInputElement).value).toBe('#ff0000')
    })
  })
})
