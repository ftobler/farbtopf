import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

/** Renders the app with the 640×400 image laid out at (100, 100) on screen, at 100 %. */
function setup() {
  const { container } = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  const workspace = container.querySelector('.workspace') as HTMLElement
  const canvas = container.querySelector('.paint-canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 100, y: 100, left: 100, top: 100, right: 740, bottom: 500, width: 640, height: 400, toJSON: () => ({}) }) as DOMRect
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
    expect(field.textContent).toBe('640 × 400 px')
    // Just outside the bottom-right corner, on the part of its handle beyond the image.
    fireEvent.pointerDown(workspace, { button: 0, pointerId: 3, clientX: 742, clientY: 502 })
    fireEvent.pointerUp(workspace, { button: 0, pointerId: 3, clientX: 742, clientY: 502 })
    expect(field.textContent).toBe('640 × 400 px')
  })

  describe('dragging from the background with the Select tool', () => {
    /** Presses the background at `from`, then drags over the canvas, which captures the pointer. */
    const dragFromBackground = (
      workspace: HTMLElement,
      canvas: HTMLCanvasElement,
      from: [number, number],
      to: [number, number],
    ) => {
      fireEvent.pointerDown(workspace, { button: 0, pointerId: 5, clientX: from[0], clientY: from[1] })
      fireEvent.pointerMove(canvas, { pointerId: 5, clientX: to[0], clientY: to[1] })
      fireEvent.pointerUp(canvas, { button: 0, pointerId: 5, clientX: to[0], clientY: to[1] })
      fireEvent.click(workspace, { button: 0, clientX: to[0], clientY: to[1] })
    }

    it('selects the whole image when dragged from above-left to below-right of it', () => {
      const { workspace, canvas, field } = setup()
      dragFromBackground(workspace, canvas, [40, 40], [950, 750])
      expect(canvas.setPointerCapture).toHaveBeenCalledWith(5)
      expect(field.textContent).toBe('640 × 400 px')
      expect(screen.getByRole('button', { name: 'Crop' }).hasAttribute('disabled')).toBe(false)
    })

    it('clamps the rectangle to the image', () => {
      const { workspace, canvas, field } = setup()
      // Image space: from (850, -50) to (400, 700).
      dragFromBackground(workspace, canvas, [950, 50], [500, 800])
      expect(field.textContent).toBe('240 × 400 px')
    })

    it('replaces an existing selection', () => {
      const { workspace, canvas, field, select } = setup()
      select()
      dragFromBackground(workspace, canvas, [40, 40], [199, 149])
      expect(field.textContent).toBe('100 × 50 px')
    })

    it('selects nothing when the rectangle misses the image', () => {
      const { workspace, canvas, field, select } = setup()
      select()
      dragFromBackground(workspace, canvas, [40, 40], [60, 400])
      expect(field.textContent).toBe('')
      dragFromBackground(workspace, canvas, [950, 40], [990, 800])
      expect(field.textContent).toBe('')
    })

    it('shows the selection while the drag is in progress', () => {
      const { workspace, canvas, field } = setup()
      fireEvent.pointerDown(workspace, { button: 0, pointerId: 5, clientX: 40, clientY: 40 })
      expect(field.textContent).toBe('')
      fireEvent.pointerMove(canvas, { pointerId: 5, clientX: 149, clientY: 119 })
      expect(field.textContent).toBe('50 × 20 px')
      fireEvent.pointerUp(canvas, { button: 0, pointerId: 5, clientX: 149, clientY: 119 })
      expect(field.textContent).toBe('50 × 20 px')
    })

    it('does not start a drag with other tools', () => {
      const { workspace, canvas } = setup()
      fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
      fireEvent.pointerDown(workspace, { button: 0, pointerId: 5, clientX: 40, clientY: 40 })
      expect(canvas.setPointerCapture).not.toHaveBeenCalled()
    })
  })
})
