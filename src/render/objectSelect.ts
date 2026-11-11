import type { ObjectTarget } from '../core/objectSelect'
import type { Selection } from '../core/selection'

/** A request to the Object Selection worker: the image (straight RGBA bytes) and what to select. */
export interface ObjectSelectRequest {
  id: number
  width: number
  height: number
  pixels: ArrayBuffer
  target: ObjectTarget
}

export type ObjectSelectResponse = { id: number; selection: Selection | null } | { id: number; error: string }

/** Selects the object `target` picks on a `width`×`height` RGBA image; null when there is none. */
export type ObjectSelectFn = (
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  target: ObjectTarget,
) => Promise<Selection | null>

/** The part of `Worker` used here. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<ObjectSelectResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: ObjectSelectRequest, transfer: Transferable[]): void
  terminate(): void
}

function startWorker(): WorkerLike {
  return new Worker(new URL('./objectSelect.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
}

/**
 * Runs Object Selection in a worker, so a slow cut never blocks painting. The
 * worker starts on the first request. When it fails (a trap in the module), the
 * pending requests are rejected and the next request starts a fresh one.
 */
export function createObjectSelect(makeWorker: () => WorkerLike = startWorker): ObjectSelectFn {
  let worker: WorkerLike | null = null
  let nextId = 1
  const pending = new Map<number, { resolve: (selection: Selection | null) => void; reject: (error: Error) => void }>()

  const ensureWorker = (): WorkerLike => {
    if (worker) return worker
    const started = makeWorker()
    started.onmessage = (event) => {
      const response = event.data
      const waiting = pending.get(response.id)
      if (!waiting) return
      pending.delete(response.id)
      if ('error' in response) waiting.reject(new Error(response.error))
      else waiting.resolve(response.selection)
    }
    started.onerror = (event) => {
      started.terminate()
      if (worker === started) worker = null
      const error = new Error(event.message || 'Object selection failed')
      for (const waiting of pending.values()) waiting.reject(error)
      pending.clear()
    }
    worker = started
    return started
  }

  return (width, height, pixels, target) =>
    new Promise((resolve, reject) => {
      const id = nextId
      nextId += 1
      pending.set(id, { resolve, reject })
      // A copy, so handing it over never detaches the caller's pixels.
      const copy = pixels.slice().buffer
      ensureWorker().postMessage({ id, width, height, pixels: copy, target }, [copy])
    })
}

/** The app's shared Object Selection worker. */
export const objectSelect: ObjectSelectFn = createObjectSelect()
