import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import type { ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 30
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }

const black = [0, 0, 0, 255]
const white = [255, 255, 255, 255]
const red = [255, 0, 0, 255]
const clear = [0, 0, 0, 0]

function setup(selectionShape: 'rectangle' | 'freeform' = 'rectangle', initialTool: ToolId = 'select') {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const element = (tool: ToolId) => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={tool}
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      shapeKind="rectangle"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
      selectionShape={selectionShape}
    />
  )
  const { container, rerender } = render(element(initialTool))
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext

  const setTool = (tool: ToolId) => rerender(element(tool))
  /** A pixel of what the canvas currently shows. */
  const shown = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    const i = (y * image.width + x) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  let pointerId = 0
  const drag = (...points: [number, number][]) => {
    pointerId += 1
    const [first, ...rest] = points
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId, clientX: first[0], clientY: first[1] })
    for (const [x, y] of rest) fireEvent.pointerMove(canvas, { buttons: 1, pointerId, clientX: x, clientY: y })
    const last = points.at(-1) ?? first
    fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: last[0], clientY: last[1] })
  }
  /** Loads a black image with a red pixel at (1, 1). */
  const loadPattern = () => {
    const bitmap = new Bitmap(SIZE, SIZE, BLACK)
    bitmap.set(1, 1, RED)
    act(() => ref.current?.loadBitmap(bitmap))
  }
  /** Traces a free-form triangle with corners (0, 0), (20, 0) and (0, 20). */
  const traceTriangle = () => drag([0, 0], [20, 0], [0, 20])
  /** Selects the 10 × 10 block at the top-left and drags it 15 px right and down. */
  const liftAndMove = () => {
    drag([0, 0], [9, 9])
    drag([5, 5], [20, 20])
  }
  return { ref, canvas, shown, drag, setTool, loadPattern, traceTriangle, liftAndMove, onHistoryChange }
}

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
  let url: string | null | undefined
  try {
    url = run()
  } finally {
    spy.mockRestore()
  }
  const image = putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number; height: number } | undefined
  const pixel = (x: number, y: number) => {
    if (!image) throw new Error('nothing was encoded')
    const i = (y * image.width + x) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  return { url, image, pixel }
}

describe('PaintCanvas invert selection', () => {
  it('selects the whole image when nothing is selected', () => {
    const { ref } = setup()
    act(() => ref.current?.invertSelection())
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: SIZE, height: SIZE })
  })

  it('selects nothing when everything was selected', () => {
    const { ref } = setup()
    act(() => ref.current?.selectAll())
    act(() => ref.current?.invertSelection())
    expect(ref.current?.getSelection()).toBeNull()
  })

  it('inverts a free-form selection pixel by pixel', () => {
    const { ref, shown, loadPattern, traceTriangle } = setup('freeform')
    loadPattern()
    traceTriangle()
    act(() => ref.current?.invertSelection())
    // The complement of the triangle reaches every edge of the image.
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: SIZE, height: SIZE })
    act(() => ref.current?.deleteSelection())
    // Inside the traced triangle survives; the rest is cleared.
    expect(shown(1, 1)).toEqual(red)
    expect(shown(2, 2)).toEqual(black)
    expect(shown(29, 29)).toEqual(white)
    expect(shown(25, 0)).toEqual(white)
  })

  it('places a moved selection before inverting', () => {
    const { ref, shown, loadPattern, liftAndMove } = setup()
    loadPattern()
    liftAndMove()
    act(() => ref.current?.invertSelection())
    // The moved block stays where it was dropped and the hole it left is background.
    expect(shown(16, 16)).toEqual(red)
    expect(shown(1, 1)).toEqual(white)
    act(() => ref.current?.undo())
    expect(shown(1, 1)).toEqual(red)
  })
})

describe('PaintCanvas delete selection', () => {
  it('does nothing without a selection', () => {
    const { ref, shown, loadPattern, onHistoryChange } = setup()
    loadPattern()
    act(() => ref.current?.deleteSelection())
    expect(shown(5, 5)).toEqual(black)
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, false)
  })

  it('fills a rectangle with the background colour as one undo step', () => {
    const { ref, shown, drag, loadPattern } = setup()
    loadPattern()
    drag([0, 0], [2, 2])
    act(() => ref.current?.deleteSelection())
    expect(shown(1, 1)).toEqual(white)
    expect(shown(2, 2)).toEqual(white)
    expect(shown(3, 3)).toEqual(black)
    act(() => ref.current?.undo())
    expect(shown(1, 1)).toEqual(red)
    expect(shown(2, 2)).toEqual(black)
  })

  it('drops a moved selection, leaving the background where it was lifted from', () => {
    const { ref, shown, loadPattern, liftAndMove, onHistoryChange } = setup()
    loadPattern()
    liftAndMove()
    expect(shown(16, 16)).toEqual(red)
    act(() => ref.current?.deleteSelection())
    expect(ref.current?.getSelection()).toBeNull()
    // Neither the moved pixels nor the originals remain.
    expect(shown(16, 16)).toEqual(black)
    expect(shown(1, 1)).toEqual(white)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(shown(1, 1)).toEqual(red)
    expect(shown(16, 16)).toEqual(black)
  })
})

describe('PaintCanvas copying the selection', () => {
  it('copies nothing without a selection', () => {
    const { ref } = setup()
    expect(ref.current?.getSelectionDataUrl()).toBeNull()
  })

  it('copies the pixels inside a rectangular selection', () => {
    const { ref, drag, loadPattern } = setup()
    loadPattern()
    drag([1, 1], [3, 2])
    const { url, image, pixel } = capture(() => ref.current?.getSelectionDataUrl())
    expect(url).toMatch(/^data:image\/png/)
    expect([image?.width, image?.height]).toEqual([3, 2])
    expect(pixel(0, 0)).toEqual(red)
    expect(pixel(2, 1)).toEqual(black)
  })

  it('makes the pixels outside a free-form outline transparent', () => {
    const { ref, loadPattern, traceTriangle } = setup('freeform')
    loadPattern()
    traceTriangle()
    const { image, pixel } = capture(() => ref.current?.getSelectionDataUrl())
    expect([image?.width, image?.height]).toEqual([19, 19])
    expect(pixel(1, 1)).toEqual(red)
    expect(pixel(2, 2)).toEqual(black)
    expect(pixel(18, 18)).toEqual(clear)
  })

  it('copies a moved selection from where it was dropped', () => {
    const { ref, loadPattern, liftAndMove } = setup()
    loadPattern()
    liftAndMove()
    const { image, pixel } = capture(() => ref.current?.getSelectionDataUrl())
    expect([image?.width, image?.height]).toEqual([10, 10])
    expect(pixel(1, 1)).toEqual(red)
    expect(pixel(0, 0)).toEqual(black)
  })

  it('copies a moved free-form selection without the pixels outside its outline', () => {
    const { ref, drag, traceTriangle } = setup('freeform')
    const bitmap = new Bitmap(SIZE, SIZE, RED)
    act(() => ref.current?.loadBitmap(bitmap))
    traceTriangle()
    drag([5, 5], [10, 10])
    const { image, pixel } = capture(() => ref.current?.getSelectionDataUrl())
    expect([image?.width, image?.height]).toEqual([19, 19])
    expect(pixel(1, 1)).toEqual(red)
    expect(pixel(18, 18)).toEqual(clear)
  })
})

describe('PaintCanvas copying what is visible', () => {
  /** Red pixel at (1, 1) on the background, a black dot at (17, 17) on a layer above. */
  const layered = () => {
    const s = setup()
    s.loadPattern()
    act(() => s.ref.current?.addLayer())
    s.setTool('pencil')
    s.drag([17, 17])
    act(() => s.ref.current?.selectLayer(0))
    s.setTool('select')
    return s
  }

  it('flattens the layers above over a moved selection', () => {
    const { ref, liftAndMove } = layered()
    liftAndMove()
    const { image, pixel } = capture(() => ref.current?.getVisibleDataUrl())
    expect([image?.width, image?.height]).toEqual([10, 10])
    expect(pixel(1, 1)).toEqual(red)
    expect(pixel(2, 2)).toEqual(black)
    expect(pixel(0, 0)).toEqual(black)
  })

  it('copies the whole flattened image once a moved selection is placed', () => {
    const { ref, liftAndMove } = layered()
    liftAndMove()
    act(() => ref.current?.clearSelection())
    const { image, pixel } = capture(() => ref.current?.getVisibleDataUrl())
    expect([image?.width, image?.height]).toEqual([SIZE, SIZE])
    expect(pixel(16, 16)).toEqual(red)
    expect(pixel(1, 1)).toEqual(white)
    expect(pixel(17, 17)).toEqual(black)
  })
})

describe('PaintCanvas select all and deselect', () => {
  it('places a moved selection when deselecting', () => {
    const { ref, shown, loadPattern, liftAndMove, onHistoryChange } = setup()
    loadPattern()
    liftAndMove()
    act(() => ref.current?.clearSelection())
    expect(ref.current?.getSelection()).toBeNull()
    expect(shown(16, 16)).toEqual(red)
    expect(shown(1, 1)).toEqual(white)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('places a moved selection before selecting all', () => {
    const { ref, shown, loadPattern, liftAndMove } = setup()
    loadPattern()
    liftAndMove()
    act(() => ref.current?.selectAll())
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: SIZE, height: SIZE })
    expect(shown(16, 16)).toEqual(red)
    act(() => ref.current?.deleteSelection())
    expect(shown(16, 16)).toEqual(white)
  })

  it('keeps a pending shape adjustable when deselecting', () => {
    const { ref, shown, drag } = setup('rectangle', 'shape')
    drag([2, 2], [7, 7])
    act(() => ref.current?.clearSelection())
    expect(ref.current?.hasPendingShape()).toBe(true)
    act(() => fireEvent.keyDown(window, { key: 'Enter' }))
    expect(ref.current?.hasPendingShape()).toBe(false)
    expect(shown(2, 2)).toEqual(black)
    expect(shown(4, 4)).toEqual(white)
  })
})
