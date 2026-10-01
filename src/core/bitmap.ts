import type { Rgba } from './color'
import { clampByte } from './color'

/**
 * A mutable RGBA pixel buffer. This is the paint surface the tools draw onto.
 * Kept free of any DOM types so the drawing algorithms stay unit-testable.
 */
export class Bitmap {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray

  constructor(width: number, height: number, fill?: Rgba) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.data = new Uint8ClampedArray(this.width * this.height * 4)
    if (fill) this.fill(fill)
  }

  static fromImageData(image: { width: number; height: number; data: Uint8ClampedArray }): Bitmap {
    const bitmap = new Bitmap(image.width, image.height)
    bitmap.data.set(image.data)
    return bitmap
  }

  /** Returns a real DOM ImageData when available (used for canvas painting). */
  toImageData(): ImageData {
    const data = new Uint8ClampedArray(this.data)
    if (typeof ImageData !== 'undefined') return new ImageData(data, this.width, this.height)
    return { width: this.width, height: this.height, data } as unknown as ImageData
  }

  clone(): Bitmap {
    const copy = new Bitmap(this.width, this.height)
    copy.data.set(this.data)
    return copy
  }

  private index(x: number, y: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1
    const px = Math.floor(x)
    const py = Math.floor(y)
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return -1
    return (py * this.width + px) * 4
  }

  contains(x: number, y: number): boolean {
    return this.index(x, y) >= 0
  }

  get(x: number, y: number): Rgba {
    const i = this.index(x, y)
    if (i < 0) return { r: 0, g: 0, b: 0, a: 0 }
    return { r: this.data[i], g: this.data[i + 1], b: this.data[i + 2], a: this.data[i + 3] }
  }

  set(x: number, y: number, color: Rgba): void {
    const i = this.index(x, y)
    if (i < 0) return
    this.data[i] = clampByte(color.r)
    this.data[i + 1] = clampByte(color.g)
    this.data[i + 2] = clampByte(color.b)
    this.data[i + 3] = clampByte(color.a)
  }

  fill(color: Rgba): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) this.set(x, y, color)
    }
  }

  /** Clears every pixel to the given color, keeping the same dimensions. */
  clear(color: Rgba): void {
    this.fill(color)
  }
}
