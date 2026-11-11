import type { ObjectTarget, Removal } from '../core/algorithms'
import type { Selection } from '../core/selection'

/** A request to the algorithms worker: the image (straight RGBA bytes) and what to do with it. */
export type AlgorithmRequest = { id: number; width: number; height: number; pixels: ArrayBuffer } & (
  | { op: 'select'; target: ObjectTarget }
  | { op: 'remove'; stroke: ArrayBuffer; closeLoops: boolean }
)

export type AlgorithmResponse =
  | { id: number; selection: Selection | null }
  | { id: number; removal: Removal | null }
  | { id: number; error: string }

/** Selects the object `target` picks on a `width`×`height` RGBA image; null when there is none. */
export type ObjectSelectFn = (
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  target: ObjectTarget,
) => Promise<Selection | null>

/**
 * Fills what `stroke` (one byte per pixel, non-zero where the brush painted)
 * covers on a `width`×`height` RGBA image; null when nothing changes.
 */
export type RemoveFn = (
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  stroke: Uint8Array,
  closeLoops?: boolean,
) => Promise<Removal | null>

/** The part of `Worker` used here. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<AlgorithmResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: AlgorithmRequest, transfer: Transferable[]): void
  terminate(): void
}

function startWorker(): WorkerLike {
  return new Worker(new URL('./algorithms.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
}

type Waiting = { resolve: (response: AlgorithmResponse) => void; reject: (error: Error) => void }

/**
 * Runs the image algorithms in a worker, so a slow cut or fill never blocks
 * painting. The worker starts on the first request. When it fails (a trap in the
 * module), the pending requests are rejected and the next one starts a fresh worker.
 */
export function createAlgorithms(makeWorker: () => WorkerLike = startWorker): { objectSelect: ObjectSelectFn; remove: RemoveFn } {
  let worker: WorkerLike | null = null
  let nextId = 1
  const pending = new Map<number, Waiting>()

  const ensureWorker = (): WorkerLike => {
    if (worker) return worker
    const started = makeWorker()
    started.onmessage = (event) => {
      const response = event.data
      const waiting = pending.get(response.id)
      if (!waiting) return
      pending.delete(response.id)
      if ('error' in response) waiting.reject(new Error(response.error))
      else waiting.resolve(response)
    }
    started.onerror = (event) => {
      started.terminate()
      if (worker === started) worker = null
      const error = new Error(event.message || 'The image algorithms failed')
      for (const waiting of pending.values()) waiting.reject(error)
      pending.clear()
    }
    worker = started
    return started
  }

  /** Sends a copy of `pixels` (and of the extra buffers), so handing them over never detaches the caller's. */
  const send = (
    width: number,
    height: number,
    pixels: Uint8ClampedArray,
    request: { op: 'select'; target: ObjectTarget } | { op: 'remove'; stroke: ArrayBuffer; closeLoops: boolean },
  ) =>
    new Promise<AlgorithmResponse>((resolve, reject) => {
      const id = nextId
      nextId += 1
      pending.set(id, { resolve, reject })
      const copy = pixels.slice().buffer
      const transfer: Transferable[] = request.op === 'remove' ? [copy, request.stroke] : [copy]
      ensureWorker().postMessage({ id, width, height, pixels: copy, ...request }, transfer)
    })

  return {
    objectSelect: async (width, height, pixels, target) => {
      const response = await send(width, height, pixels, { op: 'select', target })
      return 'selection' in response ? response.selection : null
    },
    remove: async (width, height, pixels, stroke, closeLoops = true) => {
      const response = await send(width, height, pixels, { op: 'remove', stroke: stroke.slice().buffer, closeLoops })
      return 'removal' in response ? response.removal : null
    },
  }
}

const shared = createAlgorithms()

/** Object Selection on the app's shared algorithms worker. */
export const objectSelect: ObjectSelectFn = shared.objectSelect

/** The Remove Tool on the app's shared algorithms worker. */
export const removeObject: RemoveFn = shared.remove
