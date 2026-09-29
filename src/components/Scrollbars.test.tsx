import { useRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../core/geometry'
import { Scrollbars } from './Scrollbars'

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
let workspaceRect = { width: 800, height: 600 }

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
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({}),
      } as DOMRect
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
    expect(parseFloat(element.style.width)).toBeCloseTo(297.79, 1)
    expect(parseFloat(element.style.left)).toBeCloseTo(247.1, 1)
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
    expect(parseFloat(element().style.left)).toBeCloseTo(247.1, 1)
    view.rerender(<Harness {...props} pan={{ x: 624, y: 0 }} />)
    expect(parseFloat(element().style.left)).toBeCloseTo(0, 1)
    view.rerender(<Harness {...props} pan={{ x: -624, y: 0 }} />)
    expect(parseFloat(element().style.left)).toBeCloseTo(494.2, 1)
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

  it('jumps the thumb when the track is clicked', () => {
    const onPanChange = vi.fn()
    const { bar } = setup({
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasSize: { width: 2000, height: 100 },
      onPanChange,
    })
    const element = bar('x')
    element.setPointerCapture = vi.fn()
    fireEvent.pointerDown(element, { button: 0, pointerId: 2, clientX: 700, clientY: 596 })
    const pan = onPanChange.mock.calls.at(-1)?.[0] as Point
    expect(pan.x).toBeCloseTo(-624, 1)
  })
})
