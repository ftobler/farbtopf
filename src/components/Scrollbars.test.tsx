import { useRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../core/geometry'
import { SCROLLBAR_INSET, Scrollbars } from './Scrollbars'

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
const SCROLLBAR_THICKNESS = 7
let workspaceRect = { width: 800, height: 600 }

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
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

interface HarnessProps {
  zoom: number
  pan: Point
  canvasSize: { width: number; height: number }
  onPanChange: (pan: Point) => void
}

function Harness(props: HarnessProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  return (
    <div className="workspace" ref={workspaceRef}>
      <Scrollbars workspaceRef={workspaceRef} {...props} />
    </div>
  )
}

function setup(props: HarnessProps) {
  const view = render(<Harness {...props} />)
  const workspace = view.container.querySelector('.workspace') as HTMLElement
  const thumb = (axis: 'x' | 'y') =>
    view.container.querySelector(`.workspace-scrollbar[data-axis="${axis}"] .workspace-scrollbar-thumb`) as HTMLElement
  const bar = (axis: 'x' | 'y') =>
    view.container.querySelector(`.workspace-scrollbar[data-axis="${axis}"]`) as HTMLElement
  return { ...view, workspace, thumb, bar }
}

describe('Scrollbars', () => {
  beforeEach(() => {
    workspaceRect = { width: 800, height: 600 }
    HTMLElement.prototype.getBoundingClientRect = function () {
      const { width, height } = workspaceRect
      if (this.classList.contains('workspace-scrollbar')) {
        if (this.dataset.axis === 'x') {
          return makeRect(
            SCROLLBAR_INSET,
            height - SCROLLBAR_INSET - SCROLLBAR_THICKNESS,
            Math.max(0, width - SCROLLBAR_INSET * 2),
            SCROLLBAR_THICKNESS,
          )
        }
        return makeRect(
          width - SCROLLBAR_INSET - SCROLLBAR_THICKNESS,
          SCROLLBAR_INSET,
          SCROLLBAR_THICKNESS,
          Math.max(0, height - SCROLLBAR_INSET * 2),
        )
      }
      return makeRect(0, 0, width, height)
    }
  })

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
  })

  it('renders no bars while the content fits', () => {
    const { container } = render(
      <Harness zoom={1} pan={{ x: 0, y: 0 }} canvasSize={{ width: 400, height: 300 }} onPanChange={() => {}} />,
    )
    expect(container.querySelectorAll('.workspace-scrollbar')).toHaveLength(0)
  })

  it('renders no bars when the content exactly matches the viewport', () => {
    const { container } = render(
      <Harness zoom={1} pan={{ x: 0, y: 0 }} canvasSize={{ width: 800, height: 600 }} onPanChange={() => {}} />,
    )
    expect(container.querySelectorAll('.workspace-scrollbar')).toHaveLength(0)
  })

  it('keeps a canvas that fits inside the workspace padding free of bars', () => {
    const { container } = render(
      <Harness zoom={1} pan={{ x: 0, y: 0 }} canvasSize={{ width: 780, height: 580 }} onPanChange={() => {}} />,
    )
    expect(container.querySelectorAll('.workspace-scrollbar')).toHaveLength(0)
  })

  it('shows the bars for a scrollable axis only while interacting', () => {
    const { workspace, bar } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 1600, height: 1200 },
      onPanChange: () => {},
    })
    expect(bar('x').dataset.visible).toBe('false')
    expect(bar('y').dataset.visible).toBe('false')

    fireEvent.pointerEnter(workspace)
    expect(bar('x').dataset.visible).toBe('true')
    expect(bar('y').dataset.visible).toBe('true')

    fireEvent.pointerLeave(workspace)
    expect(bar('x').dataset.visible).toBe('false')
  })

  it('only renders the axis that overflows', () => {
    const { bar } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 2000, height: 100 },
      onPanChange: () => {},
    })
    expect(bar('x')).toBeTruthy()
    expect(bar('y')).toBeNull()
  })

  it('sizes and positions the thumb from the scroll geometry', () => {
    const { thumb } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 2000, height: 100 },
      onPanChange: () => {},
    })
    const element = thumb('x')
    expect(parseFloat(element.style.width)).toBeCloseTo(316.8, 1)
    expect(parseFloat(element.style.left)).toBeCloseTo(237.6, 1)
  })

  it('sizes and positions the vertical thumb from the scroll geometry', () => {
    const { thumb } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 100, height: 2000 },
      onPanChange: () => {},
    })
    const element = thumb('y')
    expect(parseFloat(element.style.height)).toBeCloseTo(177.6, 1)
    expect(parseFloat(element.style.top)).toBeCloseTo(207.2, 1)
  })

  it('scales the thumb with the zoom level', () => {
    const { thumb } = setup({
      zoom: 2,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 600, height: 400 },
      onPanChange: () => {},
    })
    expect(parseFloat(thumb('x').style.width)).toBeCloseTo(528, 1)
    expect(parseFloat(thumb('x').style.left)).toBeCloseTo(132, 1)
    expect(parseFloat(thumb('y').style.height)).toBeCloseTo(444, 1)
    expect(parseFloat(thumb('y').style.top)).toBeCloseTo(74, 1)
  })

  it('moves the thumb when the pan changes', () => {
    const props = {
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 2000, height: 100 },
      onPanChange: () => {},
    }
    const view = render(<Harness {...props} />)
    const element = () =>
      view.container.querySelector('.workspace-scrollbar[data-axis="x"] .workspace-scrollbar-thumb') as HTMLElement
    expect(parseFloat(element().style.left)).toBeCloseTo(237.6, 1)
    view.rerender(<Harness {...props} pan={{ x: 600, y: 0 }} />)
    expect(parseFloat(element().style.left)).toBeCloseTo(0, 1)
    view.rerender(<Harness {...props} pan={{ x: -600, y: 0 }} />)
    expect(parseFloat(element().style.left)).toBeCloseTo(475.2, 1)
  })

  it('clamps the thumb for a pan far outside the scroll range without overflowing', () => {
    const props = {
      zoom: 1,
      canvasSize: { width: 2000, height: 100 },
      onPanChange: () => {},
    }
    const view = render(<Harness {...props} pan={{ x: 1e9, y: 0 }} />)
    const element = () =>
      view.container.querySelector('.workspace-scrollbar[data-axis="x"] .workspace-scrollbar-thumb') as HTMLElement
    const start = parseFloat(element().style.left)
    expect(Number.isFinite(start)).toBe(true)
    expect(start).toBeCloseTo(0, 1)

    view.rerender(<Harness {...props} pan={{ x: -1e9, y: 0 }} />)
    const end = parseFloat(element().style.left)
    expect(Number.isFinite(end)).toBe(true)
    expect(end).toBeCloseTo(475.2, 1)
  })

  it('pans the canvas in the opposite direction of the dragged thumb', () => {
    const onPanChange = vi.fn()
    const { thumb } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 2000, height: 100 },
      onPanChange,
    })
    const element = thumb('x')
    element.setPointerCapture = vi.fn()
    element.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(element, { button: 0, pointerId: 1, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(element, { pointerId: 1, clientX: 400, clientY: 300 })
    const pan = onPanChange.mock.calls.at(-1)?.[0] as Point
    expect(pan.x).toBeCloseTo(-252.5, 1)
    expect(pan.x).toBeLessThan(0)
    fireEvent.pointerUp(element, { pointerId: 1, clientX: 400, clientY: 300 })
  })

  it('keeps the pan when the middle of the track is clicked', () => {
    const onPanChange = vi.fn()
    const { bar } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 2000, height: 100 },
      onPanChange,
    })
    const element = bar('x')
    element.setPointerCapture = vi.fn()
    fireEvent.pointerDown(element, { button: 0, pointerId: 2, clientX: 400, clientY: 592 })
    const pan = onPanChange.mock.calls.at(-1)?.[0] as Point
    expect(pan.x).toBeCloseTo(0, 1)
  })

  it('jumps the vertical thumb when the track is clicked', () => {
    const onPanChange = vi.fn()
    const { bar } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 100, height: 2000 },
      onPanChange,
    })
    const element = bar('y')
    element.setPointerCapture = vi.fn()
    fireEvent.pointerDown(element, { button: 0, pointerId: 3, clientX: 792, clientY: 300 })
    const pan = onPanChange.mock.calls.at(-1)?.[0] as Point
    expect(pan.y).toBeCloseTo(0, 1)
    expect(pan.x).toBe(0)
  })

  it('maps a click at a quarter of the track to the expected pan', () => {
    const onPanChange = vi.fn()
    const { bar } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 2000, height: 100 },
      onPanChange,
    })
    const element = bar('x')
    element.setPointerCapture = vi.fn()
    fireEvent.pointerDown(element, { button: 0, pointerId: 4, clientX: 202, clientY: 592 })
    const pan = onPanChange.mock.calls.at(-1)?.[0] as Point
    expect(pan.x).toBeCloseTo(500, 1)
  })
})
