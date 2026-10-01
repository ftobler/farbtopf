import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatusBar } from './StatusBar'
import type { StatusBarProps } from './StatusBar'

function renderBar(props: Partial<StatusBarProps> = {}) {
  return render(
    <StatusBar
      cursor={null}
      width={800}
      height={600}
      zoom={1}
      toolLabel="Pencil"
      showGrid={false}
      onToggleGrid={vi.fn()}
      onZoomChange={vi.fn()}
      {...props}
    />,
  )
}

describe('StatusBar', () => {
  it('shows the selection size with a dashed selection icon', () => {
    renderBar({ selectionSize: { width: 120, height: 45 } })
    const field = screen.getByLabelText('Selection size')
    expect(field.textContent).toBe('120 × 45 px')
    expect(field.querySelector('svg')).not.toBeNull()
  })

  it('leaves the selection field empty without a selection', () => {
    renderBar({ selectionSize: null })
    const field = screen.getByLabelText('Selection size')
    expect(field.textContent).toBe('')
    expect(field.querySelector('svg')).toBeNull()
  })

  it('places the selection size between the cursor and the image size', () => {
    const { container } = renderBar({ selectionSize: { width: 3, height: 4 } })
    const items = [...container.querySelectorAll('.status-item')].map((item) => item.textContent)
    expect(items.slice(0, 3)).toEqual(['—', '3 × 4 px', '800 × 600 px'])
  })

  it('lets the zoom slider reach 1600%', () => {
    const onZoomChange = vi.fn()
    renderBar({ zoom: 1, onZoomChange })
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '11' } })
    expect(onZoomChange).toHaveBeenLastCalledWith(16)
  })

  it('shows 1600% with the slider at its end', () => {
    renderBar({ zoom: 16 })
    const slider = screen.getByLabelText('Zoom') as HTMLInputElement
    expect(slider.value).toBe(slider.max)
    expect(screen.getByText('1600%')).toBeTruthy()
  })

  it('zooms in from 800% to 1200%', () => {
    const onZoomChange = vi.fn()
    renderBar({ zoom: 8, onZoomChange })
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(onZoomChange).toHaveBeenCalledWith(12)
  })
})
