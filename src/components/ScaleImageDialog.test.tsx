import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScaleImageDialog } from './ScaleImageDialog'

function setup(initialWidth = 800, initialHeight = 600) {
  const onCancel = vi.fn()
  const onApply = vi.fn()
  render(
    <ScaleImageDialog
      open
      initialWidth={initialWidth}
      initialHeight={initialHeight}
      onCancel={onCancel}
      onApply={onApply}
    />,
  )
  const horizontal = screen.getByLabelText('Horizontal') as HTMLInputElement
  const vertical = screen.getByLabelText('Vertical') as HTMLInputElement
  const lock = screen.getByLabelText('Maintain aspect ratio') as HTMLInputElement
  const percent = screen.getByRole('button', { name: 'Percentage' })
  const pixels = screen.getByRole('button', { name: 'Pixels' })
  const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
  return { onCancel, onApply, horizontal, vertical, lock, percent, pixels, apply }
}

describe('ScaleImageDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ScaleImageDialog
        open={false}
        initialWidth={10}
        initialHeight={10}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stacks the horizontal field above the vertical one', () => {
    const { horizontal, vertical } = setup()
    const form = horizontal.form!
    expect(form.classList.contains('stacked')).toBe(true)
    const rows = Array.from(form.children)
    expect(rows).toHaveLength(2)
    expect(rows[0].contains(horizontal)).toBe(true)
    expect(rows[1].contains(vertical)).toBe(true)
  })

  it('starts in percentage mode at 100% with the ratio locked', () => {
    const { horizontal, vertical, lock, percent, pixels } = setup()
    expect(percent.getAttribute('aria-pressed')).toBe('true')
    expect(pixels.getAttribute('aria-pressed')).toBe('false')
    expect(horizontal.value).toBe('100')
    expect(vertical.value).toBe('100')
    expect(lock.checked).toBe(true)
  })

  it('scales both axes by the same percentage when locked', () => {
    const { horizontal, vertical, apply, onApply } = setup()
    fireEvent.change(horizontal, { target: { value: '50' } })
    expect(vertical.value).toBe('50')
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(400, 300)
  })

  it('scales axes independently by percentage when unlocked', () => {
    const { horizontal, vertical, lock, apply, onApply } = setup()
    fireEvent.click(lock)
    fireEvent.change(horizontal, { target: { value: '200' } })
    expect(vertical.value).toBe('100')
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(1600, 600)
  })

  it('switches to pixels showing the current target size', () => {
    const { horizontal, vertical, pixels } = setup()
    fireEvent.change(horizontal, { target: { value: '50' } })
    fireEvent.click(pixels)
    expect(pixels.getAttribute('aria-pressed')).toBe('true')
    expect(horizontal.value).toBe('400')
    expect(vertical.value).toBe('300')
  })

  it('keeps the aspect ratio in pixel mode when locked', () => {
    const { horizontal, vertical, pixels, apply, onApply } = setup()
    fireEvent.click(pixels)
    fireEvent.change(vertical, { target: { value: '300' } })
    expect(horizontal.value).toBe('400')
    fireEvent.change(horizontal, { target: { value: '1000' } })
    expect(vertical.value).toBe('750')
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(1000, 750)
  })

  it('keeps the two fields in ratio when the unit changes', () => {
    const { horizontal, vertical, pixels, percent } = setup()
    fireEvent.click(pixels)
    fireEvent.change(horizontal, { target: { value: '333' } })
    expect(vertical.value).toBe('250')
    fireEvent.click(percent)
    expect(horizontal.value).toBe(vertical.value)
  })

  it('allows scaling below the new-canvas minimum', () => {
    const { apply, onApply } = setup(10, 5)
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(10, 5)
  })

  it('sets pixel sizes independently when unlocked', () => {
    const { horizontal, vertical, pixels, lock, apply, onApply } = setup()
    fireEvent.click(pixels)
    fireEvent.click(lock)
    fireEvent.change(horizontal, { target: { value: '123' } })
    expect(vertical.value).toBe('600')
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(123, 600)
  })

  it('switches back to percentage from pixel values', () => {
    const { horizontal, vertical, pixels, percent, lock } = setup()
    fireEvent.click(pixels)
    fireEvent.click(lock)
    fireEvent.change(horizontal, { target: { value: '200' } })
    fireEvent.click(percent)
    expect(horizontal.value).toBe('25')
    expect(vertical.value).toBe('100')
  })

  it('shows the resulting size', () => {
    const { horizontal } = setup()
    fireEvent.change(horizontal, { target: { value: '25' } })
    expect(screen.getByText('200 × 150 px')).toBeTruthy()
  })

  it('applies on enter', () => {
    const { horizontal, onApply } = setup()
    fireEvent.change(horizontal, { target: { value: '10' } })
    fireEvent.submit(horizontal.form!)
    expect(onApply).toHaveBeenCalledWith(80, 60)
  })

  it('cannot apply an empty or non-positive value', () => {
    const { horizontal, lock, apply, onApply } = setup()
    fireEvent.click(lock)
    fireEvent.change(horizontal, { target: { value: '' } })
    expect(apply.disabled).toBe(true)
    fireEvent.change(horizontal, { target: { value: '0' } })
    expect(apply.disabled).toBe(true)
    fireEvent.click(apply)
    fireEvent.submit(horizontal.form!)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('cancels with the button and escape', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
