import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import type { ShapeKind } from '../core/shapes'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 20
const white = [255, 255, 255, 255]

function setup(shapeKind: ShapeKind = 'rectangle') {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="shape"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      shapeKind={shapeKind}
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
    />,
  )
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const pixel = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    return Array.from(image.data.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4))
  }
  const isWhite = (x: number, y: number) => pixel(x, y).every((value, i) => value === white[i])
  const drag = (from: [number, number], to: [number, number], pointerId = 1) => {
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: to[0], clientY: to[1] })
  }
  /** A press on the workspace around the image, as the app forwards it; the canvas then holds the capture. */
  const workspaceDrag = (from: [number, number], to: [number, number], pointerId = 2) => {
    act(() => ref.current?.clickOutside(from[0], from[1], pointerId))
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: to[0], clientY: to[1] })
  }
  const commit = () => act(() => fireEvent.keyDown(window, { key: 'Enter' }))
  return { canvas, drag, workspaceDrag, isWhite, commit, onHistoryChange }
}

describe('PaintCanvas pending shape handle cursor', () => {
  const hover = (canvas: HTMLCanvasElement, x: number, y: number) =>
    fireEvent.pointerMove(canvas, { buttons: 0, pointerId: 1, clientX: x, clientY: y })

  it('shows a resize cursor over a handle of the pending shape and the crosshair elsewhere', () => {
    const { canvas, drag } = setup()
    drag([0, 0], [19, 19])
    hover(canvas, 19, 19)
    expect(canvas.style.cursor).toBe('nwse-resize')
    hover(canvas, 19, 9)
    expect(canvas.style.cursor).toBe('ew-resize')
    // The middle of the box is out of reach of every handle.
    hover(canvas, 9, 9)
    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('shows the move cursor over the body of a pending line', () => {
    const { canvas, drag } = setup('line')
    drag([0, 10], [19, 10])
    hover(canvas, 9, 10)
    expect(canvas.style.cursor).toBe('move')
    hover(canvas, 9, 2)
    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('drops the handle cursor once the shape is placed', () => {
    const { canvas, drag, commit } = setup()
    drag([2, 2], [16, 16])
    hover(canvas, 16, 16)
    commit()
    expect(canvas.style.cursor).toBe('crosshair')
  })
})

describe('PaintCanvas pending shape handles outside the image', () => {
  it('regrabs a corner handle that sits past the image edge', () => {
    const { canvas, drag, workspaceDrag, isWhite, commit } = setup()
    // The rectangle's far corner is at (40,40), well outside the 20×20 image.
    drag([5, 5], [40, 40])
    workspaceDrag([40, 40], [15, 15])
    expect(canvas.setPointerCapture).toHaveBeenLastCalledWith(2)
    commit()
    // The corner moved to (15,15): the right side now runs through the image.
    expect(isWhite(15, 10)).toBe(false)
    expect(isWhite(5, 10)).toBe(false)
  })

  it('grabs the handle from a press within reach of it, not only dead on', () => {
    const { drag, workspaceDrag, isWhite, commit } = setup()
    drag([5, 5], [40, 40])
    workspaceDrag([43, 42], [15, 15])
    commit()
    expect(isWhite(15, 10)).toBe(false)
  })

  it('regrabs it with another pointer, as a touch or pen press does', () => {
    const { drag, workspaceDrag, isWhite, commit } = setup()
    drag([5, 5], [40, 40])
    workspaceDrag([40, 40], [15, 15], 7)
    commit()
    expect(isWhite(15, 10)).toBe(false)
  })

  it('still places the pending shape on a workspace press away from its handles', () => {
    const { drag, workspaceDrag, isWhite, onHistoryChange } = setup()
    drag([5, 5], [40, 40])
    const calls = onHistoryChange.mock.calls.length
    workspaceDrag([80, 80], [15, 15])
    // The rectangle was stamped as it was and the press did not move it.
    expect(onHistoryChange.mock.calls.length).toBeGreaterThan(calls)
    expect(isWhite(5, 10)).toBe(false)
    expect(isWhite(15, 10)).toBe(true)
  })
})
