import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

function setup() {
  const ref = createRef<PaintCanvasHandle>()
  const putImageData = vi.fn()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={30}
      initialHeight={30}
      tool="brush"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      onSelectionChange={vi.fn()}
      transparentSelection={false}
      selectionShape="rectangle"
    />,
  )
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  canvas.getContext = vi.fn(() => ({ putImageData })) as unknown as typeof canvas.getContext
  const lastImage = () => putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
  return { ref, putImageData, lastImage }
}

describe('PaintCanvas repaint after a document change', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('repaints a loaded image on the next frame', () => {
    const { ref, putImageData } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(30, 20, BLACK)))
    const afterLoad = putImageData.mock.calls.length
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(putImageData.mock.calls.length).toBeGreaterThan(afterLoad)
  })

  it('keeps a pasted selection on screen when it repaints on the next frame', () => {
    const { ref, putImageData, lastImage } = setup()
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 8, BLACK)))
    const afterPaste = putImageData.mock.calls.length
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(putImageData.mock.calls.length).toBeGreaterThan(afterPaste)
    // The floating paste is still shown, not the bare background underneath it.
    expect(Array.from(lastImage().data.slice(0, 4))).toEqual([0, 0, 0, 255])
  })
})
