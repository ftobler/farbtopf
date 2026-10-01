import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(open = true) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ConfirmDialog
      open={open}
      title="Discard unsaved changes?"
      message="The current image has unsaved changes."
      confirmLabel="Discard"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  )
  return { onCancel, onConfirm }
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).toBeNull()
  })

  it('shows the title and message', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeTruthy()
    expect(screen.getByText('The current image has unsaved changes.')).toBeTruthy()
  })

  it('confirms from the primary button', () => {
    const { onCancel, onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels from the cancel button', () => {
    const { onCancel, onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels on Escape', () => {
    const { onCancel } = renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels on a press outside the dialog but not inside it', () => {
    const { onCancel } = renderDialog()
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Discard unsaved changes?' }))
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
