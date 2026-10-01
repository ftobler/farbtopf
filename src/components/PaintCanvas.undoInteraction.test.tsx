import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 30
const white = [255, 255, 255, 255]

/** Captures the image drawn onto the canvas that encodes a copied PNG. */
function capture(run: () => string | null | undefined) {
  const putImageData = vi.fn()
  const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = Document.prototype.createElement.call(document, tag)
    if (element instanceof HTMLCanvasElement) {
      element.getContext = vi.fn(() => ({ putImageData })) as unknown as typeof element.getContext
    }
    return element
  }) as typeof document.createElement)
  try {
    run()
  } finally {
    spy.mockRestore()
  }
  const image = putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
  const pixel = (x: number, y: number) => {
    const i = (y * image.width + x) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  return { pixel }
}

function setup(tool: 'brush' | 'select' | 'pencil', zoom = 1) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const element = () => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={tool}
      brush="highlighter"
      primary={BLACK}
      secondary={WHITE}
      brushSize={6}
      opacity={100}
      shapeFill="outline"
      zoom={zoom}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
      selectionShape="rectangle"
    />
  )
  const { container } = render(element())
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  act(() => ref.current?.loadBitmap(new Bitmap(SIZE, SIZE, WHITE)))
  return { ref, container, canvas, onHistoryChange }
}

describe('PaintCanvas undo and redo during an interaction', () => {
  it('aborts a held highlighter stroke before undoing so a later move cannot repaint it', () => {
    const { ref, canvas, onHistoryChange } = setup('brush')
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: 15, clientY: 15 })
    act(() => ref.current?.undo())
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
    // The pointer is still held; a further move must not paint over the restored image.
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: 25, clientY: 25 })
    const { pixel } = capture(() => ref.current?.toDataUrl())
    expect(pixel(20, 20)).toEqual(white)
  })

  it('aborts a held selection move before undoing so a later move records no new step', () => {
    const { ref, canvas, onHistoryChange } = setup('select')
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: 9, clientY: 9 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 9, clientY: 9 })
    // Lift the selection with a move drag, then undo without releasing.
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 2, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 2, clientX: 8, clientY: 8 })
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
    // The pointer is still held; another move must not lift a fresh floating selection.
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 2, clientX: 25, clientY: 25 })
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
    expect(ref.current?.getSelection()).toBeNull()
    act(() => ref.current?.redo())
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('aborts a held canvas resize before undoing so a later move cannot resize again', () => {
    const { ref, container, onHistoryChange } = setup('pencil', 2)
    const frame = container.querySelector<HTMLElement>('.canvas-frame')
    const handle = container.querySelector<HTMLElement>('.canvas-resize-handle-e')
    if (!frame || !handle) throw new Error('resize handle not rendered')
    frame.getBoundingClientRect = () =>
      ({ x: 100, y: 50, left: 100, top: 50, right: 140, bottom: 90, width: 40, height: 40, toJSON: () => ({}) }) as DOMRect
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 160, clientY: 70 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 150, clientY: 70 })
    expect(ref.current?.getSize()).toEqual({ width: 25, height: SIZE })
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(ref.current?.getSize()).toEqual({ width: SIZE, height: SIZE })
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
    // The pointer is still held; another move must not resize the restored document.
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 170, clientY: 70 })
    expect(ref.current?.getSize()).toEqual({ width: SIZE, height: SIZE })
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })
})
