import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MAX_CANVAS } from '../core/palette'
import { CanvasSizeDialog } from './CanvasSizeDialog'

function setup(initialWidth = 800, initialHeight = 600) {
  const onCancel = vi.fn()
  const onApply = vi.fn()
  render(
    <CanvasSizeDialog
      open
      initialWidth={initialWidth}
      initialHeight={initialHeight}
      onCancel={onCancel}
      onApply={onApply}
    />,
  )
  const width = screen.getByLabelText('Width') as HTMLInputElement
  const height = screen.getByLabelText('Height') as HTMLInputElement
  const ok = screen.getByRole('button', { name: 'OK' }) as HTMLButtonElement
  return { onCancel, onApply, width, height, ok }
}

describe('CanvasSizeDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <CanvasSizeDialog open={false} initialWidth={10} initialHeight={10} onCancel={vi.fn()} onApply={vi.fn()} />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is labelled as a canvas size dialog', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Canvas size' })).toBeTruthy()
  })

  it('prefills the current size in pixels', () => {
    const { width, height } = setup(321, 123)
    expect(width.value).toBe('321')
    expect(height.value).toBe('123')
  })

  it('stacks the width field above the height field', () => {
    const { width, height } = setup()
    const form = width.form!
    expect(form.classList.contains('stacked')).toBe(true)
    const rows = Array.from(form.children)
    expect(rows).toHaveLength(2)
    expect(rows[0].contains(width)).toBe(true)
    expect(rows[1].contains(height)).toBe(true)
  })

  it('changes width and height independently', () => {
    const { width, height, ok, onApply } = setup()
    fireEvent.change(width, { target: { value: '1000' } })
    expect(height.value).toBe('600')
    fireEvent.change(height, { target: { value: '50' } })
    fireEvent.click(ok)
    expect(onApply).toHaveBeenCalledWith(1000, 50)
  })

  it('allows a one pixel canvas', () => {
    const { width, height, ok, onApply } = setup()
    fireEvent.change(width, { target: { value: '1' } })
    fireEvent.change(height, { target: { value: '1' } })
    fireEvent.click(ok)
    expect(onApply).toHaveBeenCalledWith(1, 1)
  })

  it('rounds fractional sizes to whole pixels', () => {
    const { width, ok, onApply } = setup()
    fireEvent.change(width, { target: { value: '99.6' } })
    fireEvent.click(ok)
    expect(onApply).toHaveBeenCalledWith(100, 600)
  })

  it('rejects empty, zero, negative and oversized values', () => {
    const { width, ok, onApply } = setup()
    for (const value of ['', '0', '-5', String(MAX_CANVAS + 1)]) {
      fireEvent.change(width, { target: { value } })
      expect(ok.disabled).toBe(true)
      fireEvent.click(ok)
      fireEvent.keyDown(width, { key: 'Enter' })
    }
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.change(width, { target: { value: String(MAX_CANVAS) } })
    expect(ok.disabled).toBe(false)
  })

  it('applies on Enter', () => {
    const { width, onApply } = setup()
    fireEvent.change(width, { target: { value: '640' } })
    fireEvent.keyDown(width, { key: 'Enter' })
    expect(onApply).toHaveBeenCalledWith(640, 600)
  })

  it('cancels with the button and Escape', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
