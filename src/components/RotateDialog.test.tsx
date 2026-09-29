import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RotateDialog } from './RotateDialog'

function setup(initialDegrees = 0) {
  const onCancel = vi.fn()
  const onApply = vi.fn()
  render(
    <RotateDialog open initialDegrees={initialDegrees} onCancel={onCancel} onApply={onApply} />,
  )
  const input = screen.getByLabelText(/Degrees \(clockwise\)/) as HTMLInputElement
  const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
  return { onCancel, onApply, input, apply }
}

describe('RotateDialog', () => {
  it('renders nothing when closed', () => {
    render(<RotateDialog open={false} initialDegrees={0} onCancel={vi.fn()} onApply={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('starts with the initial angle', () => {
    const { input } = setup(45)
    expect(input.value).toBe('45')
  })

  it('applies the entered angle', () => {
    const { input, apply, onApply } = setup()
    fireEvent.change(input, { target: { value: '30' } })
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(30)
  })

  it('accepts negative and decimal angles', () => {
    const { input, apply, onApply } = setup()
    fireEvent.change(input, { target: { value: '-12.5' } })
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(-12.5)
  })

  it('applies on enter', () => {
    const { input, onApply } = setup()
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.submit(input.form!)
    expect(onApply).toHaveBeenCalledWith(15)
  })

  it('cannot apply an invalid angle', () => {
    const { input, apply, onApply } = setup()
    fireEvent.change(input, { target: { value: '' } })
    expect(apply.disabled).toBe(true)
    fireEvent.click(apply)
    fireEvent.submit(input.form!)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('cancels with the button and escape', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
