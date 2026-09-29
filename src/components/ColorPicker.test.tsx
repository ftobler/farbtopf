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

  it('opens the color picker dialog from the trigger', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Custom colors' }))
    expect(screen.getByRole('dialog', { name: 'Color picker' })).toBeTruthy()
  })
})
