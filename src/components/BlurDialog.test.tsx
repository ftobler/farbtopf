import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BLUR_RADIUS_MAX, BLUR_RADIUS_MIN } from '../core/blur'
import { BlurDialog } from './BlurDialog'

function setup(initialRadius = 2, title = 'Blur selection') {
  const onCancel = vi.fn()
  const onApply = vi.fn()
  render(
    <BlurDialog open title={title} initialRadius={initialRadius} onCancel={onCancel} onApply={onApply} />,
  )
  const input = screen.getByLabelText(/Radius \(px\)/) as HTMLInputElement
  const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
  return { onCancel, onApply, input, apply }
}

describe('BlurDialog', () => {
  it('renders nothing when closed', () => {
    render(<BlurDialog open={false} title="Blur" initialRadius={2} onCancel={vi.fn()} onApply={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows its title and the initial radius', () => {
    const { input } = setup(3.5, 'Blur image')
    expect(screen.getByRole('dialog', { name: 'Blur image' })).toBeTruthy()
    expect(input.value).toBe('3.5')
    expect(input.min).toBe(String(BLUR_RADIUS_MIN))
    expect(input.max).toBe(String(BLUR_RADIUS_MAX))
  })

  it('applies the entered radius', () => {
    const { input, apply, onApply } = setup()
    fireEvent.change(input, { target: { value: '4.25' } })
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(4.25)
  })

  it('applies on enter', () => {
    const { input, onApply } = setup()
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.submit(input.form!)
    expect(onApply).toHaveBeenCalledWith(7)
  })

  it.each(['', 'abc', '0', '-2', String(BLUR_RADIUS_MIN - 0.1), String(BLUR_RADIUS_MAX + 1)])(
    'cannot apply the invalid radius %j',
    (value) => {
      const { input, apply, onApply } = setup()
      fireEvent.change(input, { target: { value } })
      expect(apply.disabled).toBe(true)
      expect(input.getAttribute('aria-invalid')).toBe('true')
      fireEvent.click(apply)
      fireEvent.submit(input.form!)
      expect(onApply).not.toHaveBeenCalled()
    },
  )

  it('cancels with the button and escape', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
