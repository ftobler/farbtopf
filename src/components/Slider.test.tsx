import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Slider } from './Slider'

describe('Slider', () => {
  describe('horizontal', () => {
    it('is a native range input with the shared slider class', () => {
      render(<Slider label="Zoom" className="zoom-slider" min={0} max={10} value={3} onChange={vi.fn()} />)
      const slider = screen.getByRole('slider', { name: 'Zoom' }) as HTMLInputElement
      expect(slider.tagName).toBe('INPUT')
      expect(slider.type).toBe('range')
      expect(slider.classList.contains('slider')).toBe(true)
      expect(slider.classList.contains('zoom-slider')).toBe(true)
      expect(slider.min).toBe('0')
      expect(slider.max).toBe('10')
      expect(slider.value).toBe('3')
    })

    it('reports value changes as numbers', () => {
      const onChange = vi.fn()
      render(<Slider label="Hue" min={0} max={360} value={0} onChange={onChange} />)
      fireEvent.change(screen.getByRole('slider', { name: 'Hue' }), { target: { value: '120' } })
      expect(onChange).toHaveBeenLastCalledWith(120)
    })

    it('can paint its track with a gradient', () => {
      render(<Slider label="Hue" min={0} max={360} value={0} trackBackground="linear-gradient(red, blue)" onChange={vi.fn()} />)
      const slider = screen.getByRole('slider', { name: 'Hue' })
      expect(slider.classList.contains('slider-gradient')).toBe(true)
      expect(slider.style.getPropertyValue('--slider-rail')).toBe('linear-gradient(red, blue)')
    })
  })

  describe('vertical', () => {
    function setup(value = 50, extra: Partial<Parameters<typeof Slider>[0]> = {}) {
      const onChange = vi.fn()
      render(<Slider orientation="vertical" label="Level" min={0} max={100} value={value} onChange={onChange} {...(extra as object)} />)
      const slider = screen.getByRole('slider', { name: 'Level' })
      slider.getBoundingClientRect = () =>
        ({ x: 0, y: 0, left: 0, top: 0, right: 20, bottom: 100, width: 20, height: 100, toJSON: () => ({}) }) as DOMRect
      slider.setPointerCapture = vi.fn()
      slider.releasePointerCapture = vi.fn()
      return { slider, onChange }
    }

    it('is a focusable ARIA slider with the shared rail and thumb', () => {
      const { slider } = setup(30)
      expect(slider.tagName).toBe('DIV')
      expect(slider.tabIndex).toBe(0)
      expect(slider.getAttribute('aria-orientation')).toBe('vertical')
      expect(slider.getAttribute('aria-valuenow')).toBe('30')
      expect(slider.getAttribute('aria-valuemin')).toBe('0')
      expect(slider.getAttribute('aria-valuemax')).toBe('100')
      expect(slider.classList.contains('slider')).toBe(true)
      expect(slider.classList.contains('slider-vertical')).toBe(true)
      expect(slider.querySelector('.slider-rail')).toBeTruthy()
      expect(slider.querySelector('.slider-thumb')).toBeTruthy()
      expect(parseFloat(slider.style.getPropertyValue('--slider-position'))).toBeCloseTo(0.3, 5)
    })

    it('puts larger values at the top', () => {
      const { slider, onChange } = setup()
      fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientY: 0 })
      expect(onChange).toHaveBeenLastCalledWith(100)
      fireEvent.pointerMove(slider, { pointerId: 1, clientY: 75 })
      expect(onChange).toHaveBeenLastCalledWith(25)
      fireEvent.pointerMove(slider, { pointerId: 1, clientY: 200 })
      expect(onChange).toHaveBeenLastCalledWith(0)
      fireEvent.pointerUp(slider, { pointerId: 1 })
    })

    it('steps with the keyboard by default', () => {
      const { slider, onChange } = setup(50)
      fireEvent.keyDown(slider, { key: 'ArrowUp' })
      expect(onChange).toHaveBeenLastCalledWith(51)
      fireEvent.keyDown(slider, { key: 'ArrowLeft' })
      expect(onChange).toHaveBeenLastCalledWith(49)
      fireEvent.keyDown(slider, { key: 'PageUp' })
      expect(onChange).toHaveBeenLastCalledWith(60)
      fireEvent.keyDown(slider, { key: 'Home' })
      expect(onChange).toHaveBeenLastCalledWith(0)
      fireEvent.keyDown(slider, { key: 'End' })
      expect(onChange).toHaveBeenLastCalledWith(100)
      onChange.mockClear()
      fireEvent.keyDown(slider, { key: 'a' })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('uses a custom mapping and key step when given', () => {
      const { slider, onChange } = setup(10, {
        position: 0.9,
        fromPosition: (p: number) => Math.round(p * p * 100),
        keyStep: (v: number, key: string) => (key === 'ArrowUp' ? v * 2 : null),
      })
      expect(parseFloat(slider.style.getPropertyValue('--slider-position'))).toBeCloseTo(0.9, 5)
      fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientY: 50 })
      expect(onChange).toHaveBeenLastCalledWith(25)
      fireEvent.pointerUp(slider, { pointerId: 1 })
      fireEvent.keyDown(slider, { key: 'ArrowUp' })
      expect(onChange).toHaveBeenLastCalledWith(20)
    })

    it('clamps keyboard steps to the range', () => {
      const { slider, onChange } = setup(100)
      fireEvent.keyDown(slider, { key: 'ArrowUp' })
      expect(onChange).toHaveBeenLastCalledWith(100)
    })
  })
})
