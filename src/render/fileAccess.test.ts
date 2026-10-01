import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canPickFiles,
  canSaveFiles,
  dataUrlToBlob,
  imageMimeFor,
  isAbortError,
  pickImageFile,
  pickSaveFile,
  pngName,
  writeFile,
} from './fileAccess'

function fakeHandle(name: string, permission: PermissionState = 'granted') {
  const writable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}) }
  return {
    kind: 'file' as const,
    name,
    writable,
    getFile: vi.fn(async () => new File(['x'], name, { type: imageMimeFor(name) })),
    createWritable: vi.fn(async () => writable),
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
  }
}

const asHandle = (handle: ReturnType<typeof fakeHandle>) => handle as unknown as FileSystemFileHandle

afterEach(() => {
  delete window.showOpenFilePicker
  delete window.showSaveFilePicker
})

describe('imageMimeFor', () => {
  it('maps image extensions to the matching encoder', () => {
    expect(imageMimeFor('a.png')).toBe('image/png')
    expect(imageMimeFor('a.JPG')).toBe('image/jpeg')
    expect(imageMimeFor('a.jpeg')).toBe('image/jpeg')
    expect(imageMimeFor('a.webp')).toBe('image/webp')
  })

  it('falls back to png for formats the canvas cannot write', () => {
    expect(imageMimeFor('a.gif')).toBe('image/png')
    expect(imageMimeFor('a.bmp')).toBe('image/png')
    expect(imageMimeFor('noextension')).toBe('image/png')
  })
})

describe('pngName', () => {
  it('swaps the extension for .png', () => {
    expect(pngName('photo.jpg')).toBe('photo.png')
    expect(pngName('photo')).toBe('photo.png')
    expect(pngName(null)).toBe('farbtopf.png')
  })
})

describe('dataUrlToBlob', () => {
  it('decodes base64 data with its mime type', async () => {
    const blob = dataUrlToBlob(`data:image/jpeg;base64,${btoa('abc')}`)
    expect(blob.type).toBe('image/jpeg')
    expect(await blob.text()).toBe('abc')
  })
})

describe('isAbortError', () => {
  it('recognises a cancelled picker', () => {
    expect(isAbortError(new DOMException('cancel', 'AbortError'))).toBe(true)
    expect(isAbortError(new DOMException('no', 'NotAllowedError'))).toBe(false)
    expect(isAbortError(new Error('x'))).toBe(false)
  })
})

describe('pickers', () => {
  it('reports whether the browser has the pickers', () => {
    expect(canPickFiles()).toBe(false)
    expect(canSaveFiles()).toBe(false)
    window.showOpenFilePicker = vi.fn()
    window.showSaveFilePicker = vi.fn()
    expect(canPickFiles()).toBe(true)
    expect(canSaveFiles()).toBe(true)
  })

  it('opens an image file and keeps its handle', async () => {
    const handle = fakeHandle('photo.png')
    window.showOpenFilePicker = vi.fn(async () => [asHandle(handle)])
    const picked = await pickImageFile()
    expect(picked?.file.name).toBe('photo.png')
    expect(picked?.handle).toBe(handle)
    const options = vi.mocked(window.showOpenFilePicker).mock.calls[0][0]
    expect(options?.types?.[0].accept).toHaveProperty('image/*')
  })

  it('returns null when the open picker is cancelled', async () => {
    window.showOpenFilePicker = vi.fn(async () => {
      throw new DOMException('cancel', 'AbortError')
    })
    expect(await pickImageFile()).toBeNull()
  })

  it('suggests a name and offers the matching format first when saving', async () => {
    const handle = fakeHandle('photo.jpg')
    window.showSaveFilePicker = vi.fn(async () => asHandle(handle))
    expect(await pickSaveFile('photo.jpg')).toBe(handle)
    const options = vi.mocked(window.showSaveFilePicker).mock.calls[0][0]
    expect(options?.suggestedName).toBe('photo.jpg')
    expect(Object.keys(options?.types?.[0].accept ?? {})).toEqual(['image/jpeg'])
  })

  it('returns null when the save picker is cancelled', async () => {
    window.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('cancel', 'AbortError')
    })
    expect(await pickSaveFile('a.png')).toBeNull()
  })
})

describe('writeFile', () => {
  it('writes the blob through a writable stream', async () => {
    const handle = fakeHandle('a.png')
    const blob = new Blob(['x'], { type: 'image/png' })
    await writeFile(asHandle(handle), blob)
    expect(handle.writable.write).toHaveBeenCalledWith(blob)
    expect(handle.writable.close).toHaveBeenCalled()
  })

  it('asks for write permission when it is not granted yet', async () => {
    const handle = fakeHandle('a.png')
    handle.queryPermission.mockResolvedValue('prompt')
    await writeFile(asHandle(handle), new Blob())
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    expect(handle.createWritable).toHaveBeenCalled()
  })

  it('throws NotAllowedError when permission is denied', async () => {
    const handle = fakeHandle('a.png', 'denied')
    await expect(writeFile(asHandle(handle), new Blob())).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(handle.createWritable).not.toHaveBeenCalled()
  })
})
