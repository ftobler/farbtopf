import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'

const SIZE = 20
const white = [255, 255, 255, 255]

function setup() {
  const onHistoryChange = vi.fn()
  const { container } = render(
    <PaintCanvas
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="pencil"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
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
  const canUndoSteps = () => onHistoryChange.mock.calls.filter(([canUndo]) => canUndo).length
  return { canvas, canUndoSteps, isWhite }
}

describe('PaintCanvas extra touch pointers', () => {
  it('ignores a second pointer that lands while a pencil stroke is in progress', () => {
    const { canvas, canUndoSteps, isWhite } = setup()
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: 3, clientY: 3 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: 8, clientY: 3 })
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 2, clientX: 3, clientY: 15 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 2, clientX: 15, clientY: 15 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 2, clientX: 15, clientY: 15 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 8, clientY: 3 })
    expect(canUndoSteps()).toBe(1)
    // The first stroke painted; the second pointer never started one of its own.
    expect(isWhite(3, 3)).toBe(false)
    expect(isWhite(3, 15)).toBe(true)
    expect(isWhite(15, 15)).toBe(true)
  })

  it('starts a fresh stroke from a new pointer once the first is released', () => {
    const { canvas, canUndoSteps, isWhite } = setup()
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: 3, clientY: 3 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: 8, clientY: 3 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 8, clientY: 3 })
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 3, clientX: 3, clientY: 12 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 3, clientX: 8, clientY: 12 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 3, clientX: 8, clientY: 12 })
    expect(canUndoSteps()).toBe(2)
    expect(isWhite(3, 12)).toBe(false)
  })
})
