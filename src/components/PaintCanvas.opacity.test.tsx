import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { BrushId } from '../core/brushes'
import { BLACK, WHITE } from '../core/color'
import type { ShapeKind } from '../core/shapes'
import type { ShapeFill, ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 30

interface Props {
  tool: ToolId
  brush: BrushId
  brushSize: number
  opacity: number
  shapeKind: ShapeKind
  shapeFill: ShapeFill
}

function setup(initial: Partial<Props> = {}) {
  const ref = createRef<PaintCanvasHandle>()
  const props: Props = {
    tool: 'brush',
    brush: 'round',
    brushSize: 3,
    opacity: 50,
    shapeKind: 'rectangle',
    shapeFill: 'outline',
    ...initial,
  }
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={props.tool}
      primary={BLACK}
      secondary={WHITE}
      brushSize={props.brushSize}
      opacity={props.opacity}
      brush={props.brush}
      shapeFill={props.shapeFill}
      shapeKind={props.shapeKind}
      zoom={1}
      showGrid={false}
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
    />,
  )
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const shown = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    const i = (y * image.width + x) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  const drag = (points: [number, number][], pointerId = 1) => {
    const [first, ...rest] = points
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: first[0], clientY: first[1] })
    for (const [x, y] of rest) fireEvent.pointerMove(canvas, { pointerId, clientX: x, clientY: y })
    const last = points[points.length - 1]
    fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: last[0], clientY: last[1] })
  }
  return { ref, canvas, shown, drag }
}

const gray = (pixel: number[]) => pixel[0]

describe('PaintCanvas opacity', () => {
  it('paints a half-strength brush stroke', () => {
    const { shown, drag } = setup()
    drag([[5, 10], [20, 10]])
    expect(Math.abs(gray(shown(12, 10)) - 128)).toBeLessThanOrEqual(1)
    expect(shown(12, 10)[3]).toBe(255)
  })

  it('does not build up where a single stroke crosses itself', () => {
    const { shown, drag } = setup()
    // Back and forth over the same row, then across it.
    drag([[5, 10], [20, 10], [5, 10], [20, 10], [12, 3], [12, 18]])
    const once = shown(6, 10)
    expect(shown(12, 10)).toEqual(once)
    expect(shown(19, 10)).toEqual(once)
    expect(shown(12, 16)).toEqual(once)
  })

  it('builds up across separate strokes', () => {
    const { shown, drag } = setup()
    drag([[5, 10], [20, 10]])
    const first = gray(shown(12, 10))
    drag([[5, 10], [20, 10]], 2)
    expect(gray(shown(12, 10))).toBeLessThan(first - 20)
  })

  it('paints at full strength at 100 %', () => {
    const { shown, drag } = setup({ opacity: 100 })
    drag([[5, 10], [20, 10]])
    expect(shown(12, 10)).toEqual([0, 0, 0, 255])
  })

  it('applies to the pencil', () => {
    const { shown, drag } = setup({ tool: 'pencil', brushSize: 1, opacity: 25 })
    drag([[5, 10], [20, 10], [5, 10]])
    expect(Math.abs(gray(shown(10, 10)) - 191)).toBeLessThanOrEqual(1)
  })

  it('erases partially toward the background colour without building up', () => {
    const { ref, shown, drag } = setup({ tool: 'eraser', brushSize: 4, opacity: 50 })
    act(() => ref.current?.loadBitmap(new Bitmap(SIZE, SIZE, BLACK)))
    drag([[5, 10], [20, 10], [5, 10]])
    expect(Math.abs(gray(shown(12, 10)) - 128)).toBeLessThanOrEqual(1)
    expect(shown(12, 10)).toEqual(shown(6, 10))
    expect(shown(12, 20)).toEqual([0, 0, 0, 255])
  })

  it('draws shapes at their opacity, outline corners included', () => {
    const { shown, drag } = setup({ tool: 'shape', brushSize: 2, opacity: 50 })
    drag([[5, 5], [15, 15], [25, 25]])
    expect(Math.abs(gray(shown(5, 5)) - 128)).toBeLessThanOrEqual(1)
    expect(shown(15, 5)).toEqual(shown(5, 5))
    expect(shown(15, 15)).toEqual([255, 255, 255, 255])
  })

  it('fades a filled and outlined shape evenly', () => {
    const { shown, drag } = setup({ tool: 'shape', brushSize: 2, opacity: 40, shapeFill: 'filled' })
    drag([[5, 5], [25, 25]])
    expect(shown(15, 15)).toEqual(shown(5, 5))
    expect(gray(shown(15, 15))).toBeGreaterThan(100)
  })

  it('makes a highlighter stroke lighter at a lower opacity', () => {
    const full = setup({ brush: 'highlighter', brushSize: 6, opacity: 100 })
    full.drag([[5, 10], [20, 10]])
    const strong = gray(full.shown(12, 10))
    const half = setup({ brush: 'highlighter', brushSize: 6, opacity: 50 })
    half.drag([[5, 10], [20, 10]])
    expect(gray(half.shown(12, 10))).toBeGreaterThan(strong)
    expect(gray(half.shown(12, 10))).toBeLessThan(255)
  })

  it('undoes a translucent stroke in one step', () => {
    const { ref, shown, drag } = setup()
    drag([[5, 10], [20, 10], [5, 12]])
    act(() => ref.current?.undo())
    expect(shown(12, 10)).toEqual([255, 255, 255, 255])
  })
})
