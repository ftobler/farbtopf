import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColorPalette } from './ColorPalette'
import type { Rgba } from '../core/color'

const black: Rgba = { r: 0, g: 0, b: 0, a: 255 }
const white: Rgba = { r: 255, g: 255, b: 255, a: 255 }

function renderPalette(customColors: readonly string[] = []) {
  const props = {
    onPrimaryChange: vi.fn(),
    onSecondaryChange: vi.fn(),
    onSwap: vi.fn(),
    onAddCustomColor: vi.fn(),
    onRemoveCustomColor: vi.fn(),
  }
  render(
    <ColorPalette
      primary={black}
      secondary={white}
      palette={['#ff0000', '#00ff00']}
      customColors={customColors}
      {...props}
    />,
  )
  return props
}

describe('ColorPalette', () => {
  it('shows the current primary and secondary colours', () => {
    renderPalette()
    expect((screen.getByLabelText('Primary color') as HTMLInputElement).value).toBe('#000000')
    expect((screen.getByLabelText('Secondary color') as HTMLInputElement).value).toBe('#ffffff')
  })

  it('sets the primary colour from its colour input', () => {
    const { onPrimaryChange, onSecondaryChange } = renderPalette()
    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#123456' } })
    expect(onPrimaryChange).toHaveBeenCalledWith({ r: 0x12, g: 0x34, b: 0x56, a: 255 })
    expect(onSecondaryChange).not.toHaveBeenCalled()
  })

  it('sets the secondary colour from its colour input', () => {
    const { onPrimaryChange, onSecondaryChange } = renderPalette()
    fireEvent.change(screen.getByLabelText('Secondary color'), { target: { value: '#abcdef' } })
    expect(onSecondaryChange).toHaveBeenCalledWith({ r: 0xab, g: 0xcd, b: 0xef, a: 255 })
    expect(onPrimaryChange).not.toHaveBeenCalled()
  })

  it('swaps the colours from the swap button', () => {
    const { onSwap } = renderPalette()
    fireEvent.click(screen.getByRole('button', { name: 'Swap colors' }))
    expect(onSwap).toHaveBeenCalledTimes(1)
  })

  it('picks a palette swatch into the primary colour on left click', () => {
    const { onPrimaryChange, onSecondaryChange } = renderPalette()
    fireEvent.click(screen.getByRole('button', { name: 'Color #ff0000' }))
    expect(onPrimaryChange).toHaveBeenCalledWith({ r: 255, g: 0, b: 0, a: 255 })
    expect(onSecondaryChange).not.toHaveBeenCalled()
  })

  it('picks a palette swatch into the secondary colour on right click without the browser menu', () => {
    const { onPrimaryChange, onSecondaryChange } = renderPalette()
    const notCancelled = fireEvent.contextMenu(screen.getByRole('button', { name: 'Color #00ff00' }))
    expect(notCancelled).toBe(false)
    expect(onSecondaryChange).toHaveBeenCalledWith({ r: 0, g: 255, b: 0, a: 255 })
    expect(onPrimaryChange).not.toHaveBeenCalled()
  })

  it('picks custom colours with left and right click too', () => {
    const { onPrimaryChange, onSecondaryChange } = renderPalette(['#0000ff'])
    const swatch = screen.getByRole('button', { name: 'Custom color #0000ff' })
    fireEvent.click(swatch)
    expect(onPrimaryChange).toHaveBeenCalledWith({ r: 0, g: 0, b: 255, a: 255 })
    expect(fireEvent.contextMenu(swatch)).toBe(false)
    expect(onSecondaryChange).toHaveBeenCalledWith({ r: 0, g: 0, b: 255, a: 255 })
  })
})
