import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

const originalWidth = window.innerWidth
const originalHeight = window.innerHeight

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

afterEach(() => {
  setWindowSize(originalWidth, originalHeight)
})

describe('App initial view', () => {
  it('shows the default image at 100% on a desktop', () => {
    setWindowSize(1280, 800)
    render(<App />)
    expect(screen.getByTitle('Reset zoom to 100%').textContent).toBe('100%')
  })

  it('zooms the default image out to fit a phone screen', () => {
    setWindowSize(375, 812)
    render(<App />)
    expect(screen.getByTitle('Reset zoom to 100%').textContent).toBe('50%')
  })
})

describe('App status bar on a phone', () => {
  it('marks the tool label so the phone layout can hide it', () => {
    render(<App />)
    expect(document.querySelector('.statusbar .status-tool')?.textContent).toBe('Brush')
  })
})
