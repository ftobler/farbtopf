import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App status bar selection size', () => {
  it('shows the selection size while selecting and clears it when the selection goes', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    const field = screen.getByLabelText('Selection size')
    expect(field.textContent).toBe('')
    const canvas = document.querySelector('.paint-canvas') as HTMLCanvasElement
    canvas.setPointerCapture = vi.fn()
    canvas.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 20 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 129, clientY: 64 })
    expect(field.textContent).toBe('120 × 45 px')
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 129, clientY: 64 })
    expect(field.textContent).toBe('120 × 45 px')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(field.textContent).toBe('')
  })
})
