// How the App wires Undo to unplaced work: the button and Ctrl+Z are offered for a
// pending shape or text box and take it back. What an undo restores is tested on PaintCanvas.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

function paintCanvas(container: HTMLElement) {
  const canvas = container.querySelector('.paint-canvas') as HTMLCanvasElement
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  return canvas
}

function openTextBox(container: HTMLElement, value: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Text' }))
  const canvas = paintCanvas(container)
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
  const editor = container.querySelector('.text-editor') as HTMLTextAreaElement
  fireEvent.change(editor, { target: { value } })
  return editor
}

function drawPendingRectangle(container: HTMLElement) {
  fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
  const canvas = paintCanvas(container)
  fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: 5, clientY: 5 })
  fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: 40, clientY: 40 })
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

describe('App undo with something pending', () => {
  it('offers Undo for a pending shape on a fresh image, and takes it back', () => {
    const { container } = render(<App />)
    expect(button('Undo').disabled).toBe(true)
    drawPendingRectangle(container)
    expect(button('Undo').disabled).toBe(false)
    fireEvent.click(button('Undo'))
    expect(button('Undo').disabled).toBe(true)
    expect(button('Redo').disabled).toBe(false)
  })

  it('offers Undo for an open text box with text, and takes the text back', () => {
    const { container } = render(<App />)
    const editor = openTextBox(container, 'Hello')
    expect(button('Undo').disabled).toBe(false)
    fireEvent.click(button('Undo'))
    expect(container.querySelector('.text-editor')).toBeNull()
    expect(button('Undo').disabled).toBe(true)
    expect(button('Redo').disabled).toBe(false)
    expect(editor.isConnected).toBe(false)
  })

  it('does not offer Undo for an empty text box', () => {
    const { container } = render(<App />)
    openTextBox(container, '')
    expect(button('Undo').disabled).toBe(true)
  })

  it('leaves Ctrl+Z inside the text box to the browser', () => {
    const { container } = render(<App />)
    const editor = openTextBox(container, 'Hello')
    const notPrevented = fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    expect(notPrevented).toBe(true)
    expect(container.querySelector('.text-editor')).not.toBeNull()
    expect(editor.value).toBe('Hello')
  })

  it('takes the text back on Ctrl+Z from the text toolbar', () => {
    const { container } = render(<App />)
    openTextBox(container, 'Hello')
    const bold = screen.getByRole('button', { name: 'Bold' })
    fireEvent.keyDown(bold, { key: 'z', ctrlKey: true })
    expect(container.querySelector('.text-editor')).toBeNull()
    expect(button('Redo').disabled).toBe(false)
  })
})
