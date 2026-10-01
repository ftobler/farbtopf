import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'
import { NewCanvasDialog } from './NewCanvasDialog'
import { RotateDialog } from './RotateDialog'

function NewCanvasHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open new canvas
      </button>
      <NewCanvasDialog
        open={open}
        initialWidth={800}
        initialHeight={600}
        onCancel={() => setOpen(false)}
        onCreate={() => setOpen(false)}
      />
    </>
  )
}

describe('modal focus management', () => {
  it('focuses the autofocus field of an input dialog on open', () => {
    render(<RotateDialog open initialDegrees={0} onCancel={vi.fn()} onApply={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Rotate' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(screen.getByLabelText(/Degrees \(clockwise\)/))
  })

  it('moves focus into NewCanvasDialog on open', () => {
    render(
      <NewCanvasDialog open initialWidth={800} initialHeight={600} onCancel={vi.fn()} onCreate={vi.fn()} />,
    )
    const dialog = screen.getByRole('dialog', { name: 'New image' })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('wraps Tab from the last focusable to the first', () => {
    render(
      <NewCanvasDialog open initialWidth={800} initialHeight={600} onCancel={vi.fn()} onCreate={vi.fn()} />,
    )
    const first = screen.getByRole('button', { name: '640 x 480' })
    const last = screen.getByRole('button', { name: 'Create' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first focusable to the last', () => {
    render(
      <ConfirmDialog
        open
        title="Discard unsaved changes?"
        message="The current image has unsaved changes."
        confirmLabel="Discard"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const first = screen.getByRole('button', { name: 'Cancel' })
    const last = screen.getByRole('button', { name: 'Discard' })
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('never lets focus escape the modal while tabbing', () => {
    render(<NewCanvasHarness />)
    const outside = screen.getByRole('button', { name: 'Open new canvas' })
    fireEvent.click(outside)
    const dialog = screen.getByRole('dialog', { name: 'New image' })
    const first = screen.getByRole('button', { name: '640 x 480' })
    const last = screen.getByRole('button', { name: 'Create' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(outside)
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(outside)
  })

  it('returns focus to the trigger when the dialog closes', () => {
    render(<NewCanvasHarness />)
    const trigger = screen.getByRole('button', { name: 'Open new canvas' })
    trigger.focus()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'New image' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(trigger)
  })
})
