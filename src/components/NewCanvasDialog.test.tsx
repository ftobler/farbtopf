import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewCanvasDialog } from './NewCanvasDialog'
import { MAX_CANVAS, MIN_CANVAS } from '../core/palette'

function renderDialog(open = true) {
  const onCreate = vi.fn()
  const onCancel = vi.fn()
  render(
    <NewCanvasDialog open={open} initialWidth={800} initialHeight={600} onCancel={onCancel} onCreate={onCreate} />,
  )
  return { onCreate, onCancel }
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement

describe('NewCanvasDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog', { name: 'New image' })).toBeNull()
  })

  it('starts with the initial size', () => {
    renderDialog()
    expect(field('Width').value).toBe('800')
    expect(field('Height').value).toBe('600')
  })

  it('creates an image with the typed width and height', () => {
    const { onCreate } = renderDialog()
    fireEvent.change(field('Width'), { target: { value: '320' } })
    fireEvent.change(field('Height'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith(320, 200)
  })

  it('clamps sizes beyond the allowed range', () => {
    const { onCreate } = renderDialog()
    fireEvent.change(field('Width'), { target: { value: '99999' } })
    fireEvent.change(field('Height'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith(MAX_CANVAS, MIN_CANVAS)
  })

  it('rounds fractional sizes and falls back to the minimum for an empty field', () => {
    const { onCreate } = renderDialog()
    fireEvent.change(field('Width'), { target: { value: '100.6' } })
    fireEvent.change(field('Height'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith(101, MIN_CANVAS)
  })

  it('applies a preset to both fields and marks it pressed', () => {
    const { onCreate } = renderDialog()
    const preset = screen.getByRole('button', { name: '640 x 480' })
    expect(preset.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(preset)
    expect(preset.getAttribute('aria-pressed')).toBe('true')
    expect(field('Width').value).toBe('640')
    expect(field('Height').value).toBe('480')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith(640, 480)
  })

  it('cancels from the cancel button without creating', () => {
    const { onCreate, onCancel } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('cancels on Escape', () => {
    const { onCancel } = renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels on a press outside the dialog but not inside it', () => {
    const { onCancel } = renderDialog()
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'New image' }))
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
