import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

/** Renders the app with the 800×600 image laid out at (100, 100) on screen, at 100 %. */
function setup() {
  const { container } = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  const workspace = container.querySelector('.workspace') as HTMLElement
  const canvas = container.querySelector('.paint-canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 100, y: 100, left: 100, top: 100, right: 900, bottom: 700, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  workspace.setPointerCapture = vi.fn()
  const field = screen.getByLabelText('Selection size')
  const select = () => {
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 110, clientY: 120 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 229, clientY: 164 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 229, clientY: 164 })
    expect(field.textContent).toBe('120 × 45 px')
  }
  const clickBackground = (button = 0, target: Element = workspace) => {
    fireEvent.pointerDown(target, { button, pointerId: 9, clientX: 40, clientY: 40 })
    fireEvent.pointerUp(target, { button, pointerId: 9, clientX: 40, clientY: 40 })
    fireEvent.click(target, { button, clientX: 40, clientY: 40 })
  }
  return { container, workspace, canvas, field, select, clickBackground }
}

describe('App workspace background click', () => {
  it('clears the selection when the gray background is clicked', () => {
    const { field, select, clickBackground } = setup()
    select()
    clickBackground()
    expect(field.textContent).toBe('')
    expect(screen.getByRole('button', { name: 'Crop' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps the selection on a right-click on the background and still opens the context menu', () => {
    const { workspace, field, select, clickBackground } = setup()
    select()
    clickBackground(2)
    fireEvent.contextMenu(workspace, { clientX: 40, clientY: 40 })
    expect(field.textContent).toBe('120 × 45 px')
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('keeps the selection when a drag started on the canvas ends over the background', () => {
    const { canvas, workspace, field } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 110, clientY: 120 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.click(workspace, { button: 0, clientX: 40, clientY: 40 })
    expect(field.textContent).toBe('11 × 21 px')
  })

  it('keeps the selection for clicks on the canvas, the scrollbars or the layers panel', () => {
    const { container, canvas, field, select, clickBackground } = setup()
    select()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 150, clientY: 140 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 150, clientY: 140 })
    expect(field.textContent).toBe('120 × 45 px')

    clickBackground(0, container.querySelector('.workspace-scrollbars') as Element)
    clickBackground(0, container.querySelector('.workspace-scrollbar') as Element)
    expect(field.textContent).toBe('120 × 45 px')

    fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
    clickBackground(0, container.querySelector('.layers-panel') as Element)
    expect(field.textContent).toBe('120 × 45 px')
  })

  it('keeps the selection when a resize handle that sticks out past the image is pressed', () => {
    const { field, workspace } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Select all/ }))
    expect(field.textContent).toBe('800 × 600 px')
    // Just outside the bottom-right corner, on the part of its handle beyond the image.
    fireEvent.pointerDown(workspace, { button: 0, pointerId: 3, clientX: 902, clientY: 702 })
    fireEvent.pointerUp(workspace, { button: 0, pointerId: 3, clientX: 902, clientY: 702 })
    expect(field.textContent).toBe('800 × 600 px')
  })
})
