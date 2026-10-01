// Native open/save through the File System Access API, where the browser has it
// (Chromium). Elsewhere the app falls back to a file input and downloads.

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

/** The formats the canvas can encode, in the order the save picker offers them. */
const SAVE_TYPES: Record<ImageMime, FilePickerAcceptType> = {
  'image/png': { description: 'PNG image', accept: { 'image/png': ['.png'] } },
  'image/jpeg': { description: 'JPEG image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
  'image/webp': { description: 'WebP image', accept: { 'image/webp': ['.webp'] } },
}

const OPEN_TYPES: FilePickerAcceptType[] = [
  {
    description: 'Images',
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif', '.ico'] },
  },
]

export interface PickedFile {
  file: File
  handle: FileSystemFileHandle
}

export function canPickFiles(): boolean {
  return typeof window.showOpenFilePicker === 'function'
}

export function canSaveFiles(): boolean {
  return typeof window.showSaveFilePicker === 'function'
}

/** The encoder for a file name; formats the canvas cannot write are saved as PNG. */
export function imageMimeFor(name: string): ImageMime {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  return 'image/png'
}

/** `name` with a .png extension, for downloads. */
export function pngName(name: string | null): string {
  if (!name) return 'farbtopf.png'
  return `${name.replace(/\.[^./]*$/, '')}.png`
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, comma)
  const type = header.match(/^data:([^;,]*)/)?.[1] || 'application/octet-stream'
  const payload = dataUrl.slice(comma + 1)
  if (!header.endsWith(';base64')) return new Blob([decodeURIComponent(payload)], { type })
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type })
}

/** True for the error a picker rejects with when the user cancels it. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Lets the user pick an image; null when they cancel. */
export async function pickImageFile(): Promise<PickedFile | null> {
  if (!window.showOpenFilePicker) return null
  try {
    const [handle] = await window.showOpenFilePicker({ types: OPEN_TYPES, id: 'farbtopf' })
    if (!handle) return null
    return { file: await handle.getFile(), handle }
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
}

/** Asks where to save, offering `suggestedName`'s format first; null when cancelled. */
export async function pickSaveFile(suggestedName: string): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) return null
  const preferred = imageMimeFor(suggestedName)
  const types = [SAVE_TYPES[preferred], ...Object.entries(SAVE_TYPES).filter(([mime]) => mime !== preferred).map(([, type]) => type)]
  try {
    return await window.showSaveFilePicker({ suggestedName, types, id: 'farbtopf' })
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
}

/** Overwrites the file behind `handle`, asking for write permission first if needed. */
export async function writeFile(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  if (handle.queryPermission && handle.requestPermission) {
    const descriptor = { mode: 'readwrite' } as const
    let permission = await handle.queryPermission(descriptor)
    if (permission !== 'granted') permission = await handle.requestPermission(descriptor)
    if (permission !== 'granted') throw new DOMException('Write permission was denied', 'NotAllowedError')
  }
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    // Aborting leaves the file on disk as it was.
    await writable.abort().catch(() => {})
    throw error
  }
}
