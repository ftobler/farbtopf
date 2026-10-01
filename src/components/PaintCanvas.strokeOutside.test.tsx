import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BrushId } from '../core/brushes'
import { BLACK, WHITE } from '../core/color'
import type { ShapeKind } from '../core/shapes'
import type { ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'

const SIZE = 20
const white = [255, 255, 255, 255]

interface Options {
  tool: ToolId
  brush?: BrushId
  shapeKind?: ShapeKind
  opacity?: number
}

function setup({ tool, brush = 'round', shapeKind = 'line', opacity }: Options) {
  const { container } = render(
    <PaintCanvas
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={tool}
      primary={BLACK}
      // The eraser paints the secondary colour on the background layer; black shows on white.
      secondary={tool === 'eraser' ? BLACK : WHITE}
      brushSize={1}
      brush={brush}
      opacity={opacity}
      shapeFill="outline"
      shapeKind={shapeKind}
      zoom={1}
      showGrid={false}
      onHistoryChange={vi.fn()}
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
  const drag = (from: [number, number], path: [number, number][], pointerId = 1) => {
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId, clientX: from[0], clientY: from[1] })
    for (const [x, y] of path) fireEvent.pointerMove(canvas, { buttons: 1, pointerId, clientX: x, clientY: y })
    const [x, y] = path.at(-1) ?? from
    fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: x, clientY: y })
  }
  const isWhite = (x: number, y: number) => pixel(x, y).every((value, i) => value === white[i])
  const commit = () => act(() => fireEvent.keyDown(window, { key: 'Enter' }))
  return { drag, isWhite, commit }
}

const freehand: [string, Options][] = [
  ['pencil', { tool: 'pencil' }],
  ['eraser', { tool: 'eraser' }],
  ['airbrush', { tool: 'airbrush' }],
  ['round brush', { tool: 'brush', brush: 'round' }],
  ['soft brush', { tool: 'brush', brush: 'soft' }],
  ['natural brush', { tool: 'brush', brush: 'natural' }],
  ['calligraphy brush', { tool: 'brush', brush: 'calligraphy' }],
  ['highlighter', { tool: 'brush', brush: 'highlighter' }],
  ['spray can', { tool: 'brush', brush: 'spray' }],
  ['pixelate brush', { tool: 'brush', brush: 'pixelate' }],
  ['blur brush', { tool: 'brush', brush: 'blur' }],
  ['half-strength pencil', { tool: 'pencil', opacity: 50 }],
]

describe('PaintCanvas strokes leaving the image', () => {
  it.each(freehand)('%s does not paint along the edge while the pointer is outside', (_, options) => {
    const { drag, isWhite } = setup(options)
    // Out past the right edge, down outside it and back in further down.
    drag([3, 3], [[50, 3], [50, 10], [50, 16], [3, 16]])
    // The edge column between the two crossings is left untouched.
    expect(isWhite(SIZE - 1, 10)).toBe(true)
  })

  it.each([
    ['pencil', { tool: 'pencil' } as Options],
    ['round brush', { tool: 'brush', brush: 'round' } as Options],
  ])('%s re-enters along the real crossing line', (_, options) => {
    const { drag, isWhite } = setup(options)
    // From (40,2) back to (0,22): the line passes (10,17); clamped to (19,2)-(0,19)
    // it would pass (10,~10) instead.
    drag([2, 2], [[40, 2], [0, 22]])
    expect(isWhite(10, 17)).toBe(false)
    expect(isWhite(10, 10)).toBe(true)
    expect(isWhite(SIZE - 1, 2)).toBe(false)
  })
})

describe('PaintCanvas shapes reaching past the image', () => {
  it('lets a rectangle extend past the image so its far sides are cut away', () => {
    const { drag, isWhite, commit } = setup({ tool: 'shape', shapeKind: 'rectangle' })
    drag([5, 5], [[40, 40]])
    commit()
    expect(isWhite(5, 10)).toBe(false)
    expect(isWhite(10, 5)).toBe(false)
    expect(isWhite(SIZE - 1, 10)).toBe(true)
    expect(isWhite(10, SIZE - 1)).toBe(true)
  })

  it('aims a line at the real pointer position outside the image', () => {
    const { drag, isWhite, commit } = setup({ tool: 'shape', shapeKind: 'line' })
    // Towards (40,20) it leaves through (19,10) instead of ending in the corner (19,19).
    drag([2, 2], [[40, 20]])
    commit()
    expect(isWhite(SIZE - 1, 10)).toBe(false)
    expect(isWhite(SIZE - 1, SIZE - 1)).toBe(true)
  })

  it('places a polyline corner outside the image', () => {
    const { drag, isWhite, commit } = setup({ tool: 'shape', shapeKind: 'polyline' })
    drag([2, 2], [[40, 20]])
    commit()
    expect(isWhite(SIZE - 1, 10)).toBe(false)
    expect(isWhite(SIZE - 1, SIZE - 1)).toBe(true)
  })
})
