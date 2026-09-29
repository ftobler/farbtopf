import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

class ImageDataMock {
  data: Uint8ClampedArray
  width: number
  height: number

  constructor(source: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof source === 'number') {
      this.width = source
      this.height = widthOrHeight
      this.data = new Uint8ClampedArray(this.width * this.height * 4)
      return
    }
    this.data = source
    this.width = widthOrHeight
    this.height = height ?? Math.floor(source.length / (4 * widthOrHeight))
  }
}

function createContextMock() {
  return {
    canvas: null as HTMLCanvasElement | null,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    textBaseline: '',
    putImageData: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) =>
      new ImageDataMock(width, height),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  }
}

Object.defineProperty(globalThis, 'ImageData', {
  value: ImageDataMock,
  writable: true,
  configurable: true,
})

HTMLCanvasElement.prototype.getContext = vi.fn(() => createContextMock()) as unknown as typeof HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,') as unknown as typeof HTMLCanvasElement.prototype.toDataURL

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverMock,
    writable: true,
    configurable: true,
  })
}
