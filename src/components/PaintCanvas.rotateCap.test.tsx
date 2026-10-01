import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { MAX_CANVAS } from '../core/palette'
import { rotatedSize } from '../core/raster'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

vi.mock('../core/palette', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/palette')>()
  return { ...actual, MAX_CANVAS: 40 }
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

describe('PaintCanvas whole-image rotation size cap', () => {
  it('scales an over-cap 45 degree rotation down to fit within MAX_CANVAS', () => {
    const { ref } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(40, 40, BLACK)))
    act(() => ref.current?.rotate(45))
    const size = ref.current?.getSize()
    expect(size?.width).toBeLessThanOrEqual(MAX_CANVAS)
    expect(size?.height).toBeLessThanOrEqual(MAX_CANVAS)
    expect(Math.max(size?.width ?? 0, size?.height ?? 0)).toBe(MAX_CANVAS)
    const rotated = rotatedSize(40, 40, 45)
    expect((size?.width ?? 0) / (size?.height ?? 1)).toBeCloseTo(rotated.width / rotated.height)
  })

  it('leaves a 90 degree rotation that already fits unchanged', () => {
    const { ref } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(30, 20, BLACK)))
    act(() => ref.current?.rotate(90))
    expect(ref.current?.getSize()).toEqual({ width: 20, height: 30 })
  })

  it('leaves a small 45 degree rotation unchanged', () => {
    const { ref } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(10, 10, BLACK)))
    act(() => ref.current?.rotate(45))
    expect(ref.current?.getSize()).toEqual(rotatedSize(10, 10, 45))
  })
})
