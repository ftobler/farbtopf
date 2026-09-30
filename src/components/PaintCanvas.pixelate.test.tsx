import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const W = 48
const H = 32

function checker(): Bitmap {
  const bitmap = new Bitmap(W, H, WHITE)
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if ((x + y) % 2 === 0) bitmap.set(x, y, BLACK)
  return bitmap
}

function setup() {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={W}
      initialHeight={H}
      tool="brush"
      brush="pixelate"
      primary={BLACK}
      secondary={WHITE}
      brushSize={16}
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
  const canvas = container.querySelector('canvas')!
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const shown = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    const i = (y * image.width + x) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  act(() => ref.current?.loadBitmap(checker()))
  return { ref, canvas, shown, onHistoryChange }
}

describe('PaintCanvas pixelate brush', () => {
  it('turns the pixels under a stroke into flat, grid-aligned blocks', () => {
    const { canvas, shown } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 12, clientY: 16 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 24, clientY: 16 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 18, clientY: 17 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 36, clientY: 16 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 36, clientY: 16 })
    // Size 16 → 4 px blocks; the checkerboard averages to mid grey, the same everywhere.
    const grey = shown(24, 16)
    expect(Math.abs(grey[0] - 128)).toBeLessThanOrEqual(1)
    for (let y = 12; y < 20; y += 1) for (let x = 12; x < 36; x += 1) expect(shown(x, y)).toEqual(grey)
    // Outside the stroke the checkerboard is untouched.
    expect(shown(0, 0)).toEqual([0, 0, 0, 255])
    expect(shown(1, 0)).toEqual([255, 255, 255, 255])
  })

  it('undoes a stroke in one step', () => {
    const { ref, canvas, shown } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 12, clientY: 16 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 16 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 30, clientY: 16 })
    act(() => ref.current?.undo())
    expect(shown(20, 16)).toEqual([0, 0, 0, 255])
    expect(shown(21, 16)).toEqual([255, 255, 255, 255])
  })
})
