import { Bitmap } from '../core/bitmap'

export function bitmapFromImage(image: HTMLImageElement): Bitmap {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D context is unavailable')
  context.drawImage(image, 0, 0)
  return Bitmap.fromImageData(context.getImageData(0, 0, width, height))
}

export function bitmapFromDataUrl(src: string): Promise<Bitmap> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        resolve(bitmapFromImage(image))
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
    image.onerror = () => reject(new Error('Could not load the image'))
    image.src = src
  })
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}
