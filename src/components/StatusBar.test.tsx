import { render, screen } from '@testing-library/react'
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
})
