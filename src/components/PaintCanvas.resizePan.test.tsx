import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Point } from '../core/geometry'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 20
const ZOOM = 2
const START_PAN = { x: 10, y: -6 }

/**
 * A 20 × 20 image at zoom 2. The workspace centres the image and shifts it by
 * `pan`, so its on-screen edges, relative to the workspace centre, follow from
 * the pan and the size alone.
 */
function setup() {
  const ref = createRef<PaintCanvasHandle>()
  const onPanChange = vi.fn<(pan: Point) => void>()
  let pan = START_PAN
  const element = () => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="pencil"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      zoom={ZOOM}
      pan={pan}
      showGrid={false}
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
      onPanChange={onPanChange}
    />
  )
  const { container, rerender } = render(element())
  const frame = container.querySelector<HTMLElement>('.canvas-frame')
  if (!frame) throw new Error('frame not rendered')
  // The image's box on screen when the drag starts.
  const frameLeft = 100
  const frameTop = 50
  frame.getBoundingClientRect = () =>
    ({
      x: frameLeft,
      y: frameTop,
      left: frameLeft,
      top: frameTop,
      right: frameLeft + SIZE * ZOOM,
      bottom: frameTop + SIZE * ZOOM,
      width: SIZE * ZOOM,
      height: SIZE * ZOOM,
      toJSON: () => ({}),
    }) as DOMRect

  /** The image's on-screen edges relative to the workspace centre. */
  const edges = () => {
    const size = ref.current?.getSize() ?? { width: 0, height: 0 }
    const current = onPanChange.mock.calls.at(-1)?.[0] ?? pan
    const halfWidth = (size.width * ZOOM) / 2
    const halfHeight = (size.height * ZOOM) / 2
    return {
      left: current.x - halfWidth,
      right: current.x + halfWidth,
      top: current.y - halfHeight,
      bottom: current.y + halfHeight,
    }
  }

  /** Drags a resize handle through screen points, feeding each reported pan back in like the app does. */
  const drag = (id: string, ...points: [number, number][]) => {
    const handle = container.querySelector<HTMLElement>(`.canvas-resize-handle-${id}`)
    if (!handle) throw new Error(`no ${id} handle`)
    handle.setPointerCapture = vi.fn()
    const [first] = points
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: first[0], clientY: first[1] })
    for (const [x, y] of points) {
      fireEvent.pointerMove(handle, { pointerId: 7, clientX: x, clientY: y })
      const reported = onPanChange.mock.calls.at(-1)?.[0]
      if (reported) {
        pan = reported
        rerender(element())
      }
    }
    const last = points.at(-1) ?? first
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: last[0], clientY: last[1] })
  }
  return { ref, edges, drag, onPanChange }
}

// Screen coordinates of the image's edges at the start: x 100..140, y 50..90.
describe('PaintCanvas canvas resize handles keep the opposite edge in place', () => {
  it.each<[string, [number, number], 'left' | 'right' | 'top' | 'bottom', 'left' | 'right' | 'top' | 'bottom']>([
    ['e', [160, 70], 'left', 'right'],
    ['w', [80, 70], 'right', 'left'],
    ['s', [120, 110], 'top', 'bottom'],
    ['n', [120, 30], 'bottom', 'top'],
  ])('%s handle', (id, to, pinned, moved) => {
    const { ref, edges, drag } = setup()
    const before = edges()
    drag(id, to)
    const after = edges()
    expect(ref.current?.getSize()).not.toEqual({ width: SIZE, height: SIZE })
    expect(after[pinned]).toBe(before[pinned])
    // The dragged edge moved by 20 screen pixels (10 image pixels at zoom 2).
    expect(Math.abs(after[moved] - before[moved])).toBe(20)
  })

  it.each<[string, [number, number], ('left' | 'right' | 'top' | 'bottom')[]]>([
    ['se', [160, 110], ['left', 'top']],
    ['nw', [80, 30], ['right', 'bottom']],
    ['ne', [160, 30], ['left', 'bottom']],
    ['sw', [80, 110], ['right', 'top']],
  ])('%s corner', (id, to, pinned) => {
    const { ref, edges, drag } = setup()
    const before = edges()
    drag(id, to)
    expect(ref.current?.getSize()).toEqual({ width: 30, height: 30 })
    const after = edges()
    for (const edge of pinned) expect(after[edge]).toBe(before[edge])
  })

  it('leaves the cross axis alone for a side handle', () => {
    const { drag, onPanChange } = setup()
    drag('e', [160, 70])
    expect(onPanChange).toHaveBeenLastCalledWith({ x: START_PAN.x + 20 / 2, y: START_PAN.y })
  })

  it('keeps the edge pinned through a drag that grows and then shrinks', () => {
    const { ref, edges, drag } = setup()
    const before = edges()
    drag('w', [80, 70], [60, 70], [120, 70])
    expect(ref.current?.getSize()).toEqual({ width: 10, height: SIZE })
    expect(edges().right).toBe(before.right)
    expect(edges().left).toBe(before.left + 20)
  })

  it('keeps the edge pinned when the size is clamped to one pixel', () => {
    const { ref, edges, drag } = setup()
    const before = edges()
    drag('n', [120, 500])
    expect(ref.current?.getSize()).toEqual({ width: SIZE, height: 1 })
    expect(edges().bottom).toBe(before.bottom)
  })
})
