import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { HIGHLIGHTER_ALPHA, compositeHighlighter, createCoverageMask, stampHighlighter } from '../core/brushes'
import { BLACK, WHITE } from '../core/color'
import { blendToward } from '../core/opacity'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 30
const BRUSH_SIZE = 6

function setup(opacity = 100) {
  const ref = createRef<PaintCanvasHandle>()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="brush"
      brush="highlighter"
      primary={BLACK}
      secondary={WHITE}
      brushSize={BRUSH_SIZE}
      opacity={opacity}
      shapeFill="outline"
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
  const lastImage = () => context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
  const drag = (points: [number, number][], pointerId = 1) => {
    const [first, ...rest] = points
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: first[0], clientY: first[1] })
    for (const [x, y] of rest) fireEvent.pointerMove(canvas, { pointerId, clientX: x, clientY: y })
    const last = points[points.length - 1]
    fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: last[0], clientY: last[1] })
  }
  return { ref, canvas, context, lastImage, drag }
}

/** The pixels the old full recomposite produced for the same drag. */
function expectedHighlighter(points: [number, number][], strength: number): Bitmap {
  const base = new Bitmap(SIZE, SIZE, WHITE)
  const mask = createCoverageMask(SIZE, SIZE)
  const at = (point: [number, number]) => ({ x: point[0], y: point[1] })
  stampHighlighter(mask, at(points[0]), at(points[0]), BRUSH_SIZE)
  for (let i = 1; i < points.length; i += 1) {
    stampHighlighter(mask, at(points[i - 1]), at(points[i]), BRUSH_SIZE)
  }
  const work = compositeHighlighter(base, mask, BLACK, HIGHLIGHTER_ALPHA)
  if (strength >= 1) return work
  const faded = base.clone()
  blendToward(faded, base, work, strength)
  return faded
}

describe('PaintCanvas highlighter', () => {
  it.each([100, 50])(
    'recomposites the changed region to the same pixels as a full composite at %i%% opacity',
    (opacity) => {
      const { drag, lastImage } = setup(opacity)
      const points: [number, number][] = [
        [4, 8],
        [16, 12],
        [26, 10],
      ]
      drag(points)
      const expected = expectedHighlighter(points, opacity / 100)
      expect(Array.from(lastImage().data)).toEqual(Array.from(expected.data))
    },
  )

  it('coalesces many pointer moves into a single repaint per frame', () => {
    const { context, lastImage, drag } = setup(100)
    const path: [number, number][] = []
    for (let x = 1; x <= 20; x += 1) path.push([x, 15])
    const before = context.putImageData.mock.calls.length
    drag(path)
    const repaints = context.putImageData.mock.calls.length - before
    // Many more moves than repaints: down, the frame's leading move, and the release flush.
    expect(repaints).toBeLessThan(path.length - 1)
    expect(Array.from(lastImage().data)).toEqual(Array.from(expectedHighlighter(path, 1).data))
  })
})
