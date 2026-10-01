import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { MAX_CANVAS } from '../core/palette'
import { bitmapFromDataUrl } from '../render/image'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

vi.mock('../core/palette', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/palette')>()
  return { ...actual, MAX_CANVAS: 40 }
})

vi.mock('../render/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/image')>()
  return { ...actual, bitmapFromDataUrl: vi.fn(async () => new Bitmap(100, 50, BLACK)) }
})

function domRect({ left = 0, top = 0, width, height }: { left?: number; top?: number; width: number; height: number }): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function setup(width = 30, height = 30) {
  const ref = createRef<PaintCanvasHandle>()
  const workspace = document.createElement('div')
  workspace.className = 'workspace'
  document.body.appendChild(workspace)
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={width}
      initialHeight={height}
      tool="select"
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
    { container: workspace },
  )
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () => {
    const current = ref.current?.getSize() ?? { width, height }
    return domRect({ width: current.width, height: current.height })
  }
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  canvas.getContext = vi.fn(() => ({ putImageData: vi.fn() })) as unknown as typeof canvas.getContext
  return { ref }
}

describe('PaintCanvas incoming image limit', () => {
  it('scales a loaded bitmap that exceeds the limit down proportionally', () => {
    const { ref } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(100, 50, BLACK)))
    const size = ref.current?.getSize()
    expect(size).toEqual({ width: MAX_CANVAS, height: MAX_CANVAS / 2 })
  })

  it('fits a loaded portrait bitmap by its longer side', () => {
    const { ref } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(50, 100, BLACK)))
    expect(ref.current?.getSize()).toEqual({ width: MAX_CANVAS / 2, height: MAX_CANVAS })
  })

  it('leaves a loaded bitmap that already fits untouched', () => {
    const { ref } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(30, 20, BLACK)))
    expect(ref.current?.getSize()).toEqual({ width: 30, height: 20 })
  })

  it('scales an oversized data-url image down to the limit', async () => {
    const { ref } = setup()
    await act(async () => ref.current?.loadDataUrl('data:image/png;base64,AAAA'))
    expect(bitmapFromDataUrl).toHaveBeenCalled()
    expect(ref.current?.getSize()).toEqual({ width: MAX_CANVAS, height: MAX_CANVAS / 2 })
  })

  it('leaves a paste that already fits from growing the document', () => {
    const { ref } = setup()
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 8, BLACK)))
    expect(ref.current?.getSize()).toEqual({ width: 30, height: 30 })
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 10, height: 8 })
  })

  it('scales an oversized paste so the document never exceeds the limit', () => {
    const { ref } = setup()
    act(() => ref.current?.pasteBitmap(new Bitmap(100, 50, BLACK)))
    const size = ref.current?.getSize()
    expect(size?.width).toBeLessThanOrEqual(MAX_CANVAS)
    expect(size?.height).toBeLessThanOrEqual(MAX_CANVAS)
    expect(size).toEqual({ width: MAX_CANVAS, height: 30 })
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: MAX_CANVAS, height: MAX_CANVAS / 2 })
  })

  it('scales an oversized pasted data-url image so the document stays within the limit', async () => {
    const { ref } = setup()
    await act(async () => ref.current?.pasteDataUrl('data:image/png;base64,AAAA'))
    expect(bitmapFromDataUrl).toHaveBeenCalled()
    expect(ref.current?.getSize()).toEqual({ width: MAX_CANVAS, height: 30 })
  })
})
