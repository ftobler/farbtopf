import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'

interface Box {
  left: number
  top: number
  width: number
  height: number
}

function domRect({ left, top, width, height }: Box): DOMRect {
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

const WIDTH = 100
const HEIGHT = 50
const ZOOM = 2

/**
 * Renders a 100 × 50 image at zoom 2 inside a workspace, then opens the miniature
 * view once the on-screen boxes of the workspace and the canvas are known.
 */
function setup(boxes: { workspace: Box; canvas: Box; miniature?: Box }) {
  const onPanChange = vi.fn()
  const workspace = document.createElement('div')
  workspace.className = 'workspace'
  document.body.appendChild(workspace)
  let current = boxes
  const element = (showMiniature: boolean, pan = { x: 0, y: 0 }) => (
    <PaintCanvas
      initialWidth={WIDTH}
      initialHeight={HEIGHT}
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
      showMiniature={showMiniature}
      onPanChange={onPanChange}
    />
  )
  const { container, rerender } = render(element(false), { container: workspace })
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  workspace.getBoundingClientRect = () => domRect(current.workspace)
  canvas.getBoundingClientRect = () => domRect(current.canvas)
  rerender(element(true))

  const view = container.querySelector<HTMLElement>('.miniature-view')
  const miniature = container.querySelector<HTMLCanvasElement>('.miniature-canvas')
  if (!view || !miniature) throw new Error('miniature not rendered')
  miniature.getBoundingClientRect = () => domRect(current.miniature ?? { left: 0, top: 0, width: 0, height: 0 })
  view.setPointerCapture = vi.fn()

  /** The visible-area rectangle, in percent of the miniature. */
  const viewport = () => {
    const box = container.querySelector<HTMLElement>('.miniature-viewport')
    if (!box) return null
    const { left, top, width, height } = box.style
    return { left, top, width, height }
  }
  const move = (next: Partial<typeof boxes>, pan: { x: number; y: number }) => {
    current = { ...current, ...next }
    rerender(element(true, pan))
  }
  return { view, viewport, move, onPanChange, setBoxes: (next: Partial<typeof boxes>) => (current = { ...current, ...next }) }
}

describe('PaintCanvas miniature view', () => {
  it('outlines the part of the image visible in the workspace', () => {
    // The image (200 × 100 on screen) is scrolled 40 px left and 20 px up under a 120 × 60 workspace.
    const { viewport } = setup({
      workspace: { left: 0, top: 0, width: 120, height: 60 },
      canvas: { left: -40, top: -20, width: 200, height: 100 },
    })
    // Image pixels 20..80 across and 10..40 down are visible.
    expect(viewport()).toEqual({ left: '20%', top: '20%', width: '60%', height: '60%' })
  })

  it('clips the outline to the image when the workspace is larger', () => {
    const { viewport } = setup({
      workspace: { left: 0, top: 0, width: 400, height: 300 },
      canvas: { left: 50, top: 50, width: 200, height: 100 },
    })
    expect(viewport()).toEqual({ left: '0%', top: '0%', width: '100%', height: '100%' })
  })

  it('clips the outline where the image is scrolled past the workspace edge', () => {
    // Only the right-most 20 image pixels and the bottom 10 are on screen.
    const { viewport } = setup({
      workspace: { left: 0, top: 0, width: 120, height: 60 },
      canvas: { left: -160, top: -80, width: 200, height: 100 },
    })
    expect(viewport()).toEqual({ left: '80%', top: '80%', width: '20%', height: '20%' })
  })

  it('follows the view when it is panned and when the window resizes', () => {
    const { viewport, move, setBoxes } = setup({
      workspace: { left: 0, top: 0, width: 120, height: 60 },
      canvas: { left: 0, top: 0, width: 200, height: 100 },
    })
    expect(viewport()).toEqual({ left: '0%', top: '0%', width: '60%', height: '60%' })
    move({ canvas: { left: -80, top: -40, width: 200, height: 100 } }, { x: -80, y: -40 })
    expect(viewport()).toEqual({ left: '40%', top: '40%', width: '60%', height: '60%' })
    setBoxes({ workspace: { left: 0, top: 0, width: 60, height: 30 } })
    fireEvent(window, new Event('resize'))
    expect(viewport()).toEqual({ left: '40%', top: '40%', width: '30%', height: '30%' })
  })

  it('centres the view on the point pressed in the miniature', () => {
    // The miniature shows the 100 × 50 image at 1:1 at (500, 400).
    const { view, onPanChange } = setup({
      workspace: { left: 0, top: 0, width: 120, height: 60 },
      canvas: { left: 0, top: 0, width: 200, height: 100 },
      miniature: { left: 500, top: 400, width: 100, height: 50 },
    })
    fireEvent.pointerDown(view, { button: 0, buttons: 1, pointerId: 1, clientX: 550, clientY: 425 })
    expect(onPanChange).toHaveBeenLastCalledWith({ x: 0, y: 0 })
    // Image point (10, 20) is 40 px left of and 5 px above the centre, at zoom 2.
    fireEvent.pointerDown(view, { button: 0, buttons: 1, pointerId: 1, clientX: 510, clientY: 420 })
    expect(onPanChange).toHaveBeenLastCalledWith({ x: 80, y: 10 })
  })

  it('maps through the miniature scale', () => {
    // A miniature half the image size: each miniature pixel is two image pixels.
    const { view, onPanChange } = setup({
      workspace: { left: 0, top: 0, width: 120, height: 60 },
      canvas: { left: 0, top: 0, width: 200, height: 100 },
      miniature: { left: 0, top: 0, width: 50, height: 25 },
    })
    fireEvent.pointerDown(view, { button: 0, buttons: 1, pointerId: 1, clientX: 40, clientY: 5 })
    // Image point (80, 10).
    expect(onPanChange).toHaveBeenLastCalledWith({ x: -60, y: 30 })
  })

  it('keeps centring while dragged, but not on a hover without a button', () => {
    const { view, onPanChange } = setup({
      workspace: { left: 0, top: 0, width: 120, height: 60 },
      canvas: { left: 0, top: 0, width: 200, height: 100 },
      miniature: { left: 0, top: 0, width: 100, height: 50 },
    })
    fireEvent.pointerMove(view, { buttons: 0, pointerId: 1, clientX: 10, clientY: 10 })
    expect(onPanChange).not.toHaveBeenCalled()
    fireEvent.pointerDown(view, { button: 0, buttons: 1, pointerId: 1, clientX: 50, clientY: 25 })
    fireEvent.pointerMove(view, { buttons: 1, pointerId: 1, clientX: 60, clientY: 30 })
    expect(onPanChange).toHaveBeenLastCalledWith({ x: -20, y: -10 })
    onPanChange.mockClear()
    fireEvent.pointerUp(view, { button: 0, pointerId: 1, clientX: 60, clientY: 30 })
    fireEvent.pointerMove(view, { buttons: 0, pointerId: 1, clientX: 90, clientY: 40 })
    expect(onPanChange).not.toHaveBeenCalled()
  })

  it('ignores presses while the miniature has no size yet', () => {
    const { view, onPanChange } = setup({
      workspace: { left: 0, top: 0, width: 120, height: 60 },
      canvas: { left: 0, top: 0, width: 200, height: 100 },
    })
    fireEvent.pointerDown(view, { button: 0, buttons: 1, pointerId: 1, clientX: 10, clientY: 10 })
    expect(onPanChange).not.toHaveBeenCalled()
  })
})
