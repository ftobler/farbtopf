import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sizeToSlider, sliderToSize } from '../core/toolSettings'
import { ToolSliders } from './ToolSliders'

function setup(size = 12, opacity = 80) {
  const onSizeChange = vi.fn()
  const onOpacityChange = vi.fn()
  const onSlidingChange = vi.fn()
  const view = render(
    <ToolSliders
      size={size}
      opacity={opacity}
      onSizeChange={onSizeChange}
      onOpacityChange={onOpacityChange}
      onSlidingChange={onSlidingChange}
    />,
  )
  const sizeSlider = screen.getByRole('slider', { name: 'Size' })
  const opacitySlider = screen.getByRole('slider', { name: 'Opacity' })
  // A 100 px tall track starting at the top of the viewport.
  for (const slider of [sizeSlider, opacitySlider]) {
    slider.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: 20, bottom: 100, width: 20, height: 100, toJSON: () => ({}) }) as DOMRect
    slider.setPointerCapture = vi.fn()
    slider.releasePointerCapture = vi.fn()
  }
  return { ...view, sizeSlider, opacitySlider, onSizeChange, onOpacityChange, onSlidingChange }
}

describe('ToolSliders', () => {
  it('is a floating panel with vertical size and opacity sliders', () => {
    const { sizeSlider, opacitySlider } = setup()
    const panel = screen.getByRole('group', { name: 'Tool size and opacity' })
    expect(panel.classList.contains('tool-sliders')).toBe(true)
    expect(sizeSlider.getAttribute('aria-orientation')).toBe('vertical')
    expect(opacitySlider.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('stacks the size slider above the opacity slider, each with an icon', () => {
    const { container, sizeSlider, opacitySlider } = setup()
    expect(sizeSlider.compareDocumentPosition(opacitySlider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const rows = [...container.querySelectorAll('.tool-slider')]
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('svg.tool-slider-icon.size-icon')).toBeTruthy()
    expect(rows[1].querySelector('svg.tool-slider-icon.opacity-icon')).toBeTruthy()
    for (const icon of container.querySelectorAll('svg.tool-slider-icon')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('gives each slider its own island inside the centred group', () => {
    const { sizeSlider, opacitySlider } = setup()
    const panel = screen.getByRole('group', { name: 'Tool size and opacity' })
    const islands = [...panel.children]
    expect(islands).toHaveLength(2)
    for (const island of islands) expect(island.classList.contains('tool-slider')).toBe(true)
    expect(islands[0].contains(sizeSlider)).toBe(true)
    expect(islands[1].contains(opacitySlider)).toBe(true)
  })

  it('hints what each slider does and its value on hover', () => {
    const { container, sizeSlider, opacitySlider } = setup(12, 80)
    const rows = [...container.querySelectorAll<HTMLElement>('.tool-slider')]
    expect(rows[0].title).toBe('Size: 12 px')
    expect(rows[1].title).toBe('Opacity: 80%')
    // The accessible names stay plain.
    expect(sizeSlider.getAttribute('aria-label')).toBe('Size')
    expect(opacitySlider.getAttribute('aria-label')).toBe('Opacity')
  })

  it('shows the current values', () => {
    const { sizeSlider, opacitySlider } = setup(12, 80)
    expect(sizeSlider.getAttribute('aria-valuenow')).toBe('12')
    expect(sizeSlider.getAttribute('aria-valuemin')).toBe('1')
    expect(sizeSlider.getAttribute('aria-valuemax')).toBe('500')
    expect(sizeSlider.getAttribute('aria-valuetext')).toBe('12 px')
    expect(opacitySlider.getAttribute('aria-valuenow')).toBe('80')
    expect(opacitySlider.getAttribute('aria-valuetext')).toBe('80%')
    expect(screen.getByText('12 px')).toBeTruthy()
    expect(screen.getByText('80%')).toBeTruthy()
  })

  it('places the size thumb on the logarithmic scale', () => {
    const { container } = setup(12, 80)
    const tracks = container.querySelectorAll<HTMLElement>('.tool-slider-track')
    expect(parseFloat(tracks[0].style.getPropertyValue('--slider-position'))).toBeCloseTo(sizeToSlider(12), 3)
    expect(parseFloat(tracks[1].style.getPropertyValue('--slider-position'))).toBeCloseTo((80 - 1) / 99, 3)
  })

  it('sets the size logarithmically from where the track is pressed and dragged', () => {
    const { sizeSlider, onSizeChange } = setup()
    fireEvent.pointerDown(sizeSlider, { button: 0, pointerId: 1, clientY: 50 })
    expect(onSizeChange).toHaveBeenLastCalledWith(sliderToSize(0.5))
    fireEvent.pointerMove(sizeSlider, { pointerId: 1, clientY: 0 })
    expect(onSizeChange).toHaveBeenLastCalledWith(500)
    fireEvent.pointerMove(sizeSlider, { pointerId: 1, clientY: 100 })
    expect(onSizeChange).toHaveBeenLastCalledWith(1)
    fireEvent.pointerUp(sizeSlider, { pointerId: 1, clientY: 100 })
    onSizeChange.mockClear()
    fireEvent.pointerMove(sizeSlider, { pointerId: 1, clientY: 20 })
    expect(onSizeChange).not.toHaveBeenCalled()
  })

  it('uses the shared slider style', () => {
    const { sizeSlider, opacitySlider } = setup()
    for (const slider of [sizeSlider, opacitySlider]) {
      expect(slider.classList.contains('slider')).toBe(true)
      expect(slider.classList.contains('slider-vertical')).toBe(true)
      expect(slider.querySelector('.slider-rail')).toBeTruthy()
      expect(slider.querySelector('.slider-thumb')).toBeTruthy()
    }
  })

  it('sets the opacity linearly', () => {
    const { opacitySlider, onOpacityChange } = setup()
    fireEvent.pointerDown(opacitySlider, { button: 0, pointerId: 1, clientY: 75 })
    expect(onOpacityChange).toHaveBeenLastCalledWith(26)
    fireEvent.pointerUp(opacitySlider, { pointerId: 1, clientY: 75 })
  })

  it('reports when a slider is being dragged', () => {
    const { sizeSlider, opacitySlider, onSlidingChange } = setup()
    fireEvent.pointerDown(sizeSlider, { button: 0, pointerId: 1, clientY: 50 })
    expect(onSlidingChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerUp(sizeSlider, { pointerId: 1, clientY: 50 })
    expect(onSlidingChange).toHaveBeenLastCalledWith(false)
    fireEvent.pointerDown(opacitySlider, { button: 0, pointerId: 2, clientY: 50 })
    expect(onSlidingChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerCancel(opacitySlider, { pointerId: 2 })
    expect(onSlidingChange).toHaveBeenLastCalledWith(false)
  })

  it('ignores other mouse buttons', () => {
    const { sizeSlider, onSizeChange, onSlidingChange } = setup()
    fireEvent.pointerDown(sizeSlider, { button: 2, pointerId: 1, clientY: 50 })
    expect(onSizeChange).not.toHaveBeenCalled()
    expect(onSlidingChange).not.toHaveBeenCalled()
  })

  it('steps by one pixel or percent with the arrow keys', () => {
    const { sizeSlider, opacitySlider, onSizeChange, onOpacityChange } = setup(12, 80)
    fireEvent.keyDown(sizeSlider, { key: 'ArrowUp' })
    expect(onSizeChange).toHaveBeenLastCalledWith(13)
    fireEvent.keyDown(sizeSlider, { key: 'ArrowDown' })
    expect(onSizeChange).toHaveBeenLastCalledWith(11)
    fireEvent.keyDown(sizeSlider, { key: 'End' })
    expect(onSizeChange).toHaveBeenLastCalledWith(500)
    fireEvent.keyDown(sizeSlider, { key: 'Home' })
    expect(onSizeChange).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(sizeSlider, { key: 'PageUp' })
    expect(onSizeChange).toHaveBeenLastCalledWith(20)
    fireEvent.keyDown(opacitySlider, { key: 'ArrowRight' })
    expect(onOpacityChange).toHaveBeenLastCalledWith(81)
    fireEvent.keyDown(opacitySlider, { key: 'PageDown' })
    expect(onOpacityChange).toHaveBeenLastCalledWith(70)
  })

  it('does not let slider keys reach the workspace shortcuts', () => {
    const { sizeSlider } = setup()
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    fireEvent.keyDown(sizeSlider, { key: 'ArrowUp' })
    window.removeEventListener('keydown', onWindowKey)
    expect(onWindowKey).not.toHaveBeenCalled()
  })

  it('clamps keyboard steps to the range', () => {
    const { sizeSlider, opacitySlider, onSizeChange, onOpacityChange } = setup(500, 100)
    fireEvent.keyDown(sizeSlider, { key: 'ArrowUp' })
    expect(onSizeChange).toHaveBeenLastCalledWith(500)
    fireEvent.keyDown(opacitySlider, { key: 'ArrowUp' })
    expect(onOpacityChange).toHaveBeenLastCalledWith(100)
  })
})
