import { describe, expect, it, vi } from 'vitest'
import { createAlgorithms } from './algorithms'
import type { AlgorithmRequest, AlgorithmResponse, WorkerLike } from './algorithms'

/** A stand-in worker that records requests and answers when told to. */
function fakeWorker() {
  const sent: { request: AlgorithmRequest; transfer: Transferable[] }[] = []
  const worker: WorkerLike & { reply(response: AlgorithmResponse): void; fail(): void } = {
    onmessage: null,
    onerror: null,
    postMessage(request: AlgorithmRequest, transfer: Transferable[]) {
      sent.push({ request, transfer })
    },
    terminate: vi.fn(),
    reply(response) {
      worker.onmessage?.({ data: response } as MessageEvent<AlgorithmResponse>)
    },
    fail() {
      worker.onerror?.({ message: 'boom' } as ErrorEvent)
    },
  }
  return { worker, sent }
}

const point = { kind: 'point', point: { x: 0, y: 0 } } as const

describe('createAlgorithms', () => {
  it('sends a copy of the pixels with the target and resolves with the selection', async () => {
    const { worker, sent } = fakeWorker()
    const { objectSelect } = createAlgorithms(() => worker)
    const pixels = new Uint8ClampedArray([1, 2, 3, 4])
    const result = objectSelect(1, 1, pixels, point)
    expect(sent).toHaveLength(1)
    const { request, transfer } = sent[0]
    expect(request).toMatchObject({ op: 'select', width: 1, height: 1, target: point })
    expect(Array.from(new Uint8ClampedArray(request.pixels))).toEqual([1, 2, 3, 4])
    expect(transfer).toEqual([request.pixels])
    expect(request.pixels).not.toBe(pixels.buffer)
    const selection = { rect: { x: 0, y: 0, width: 1, height: 1 }, mask: null }
    worker.reply({ id: request.id, selection })
    await expect(result).resolves.toEqual(selection)
  })

  it('sends a copy of the stroke for a removal and resolves with what changed', async () => {
    const { worker, sent } = fakeWorker()
    const { remove } = createAlgorithms(() => worker)
    const stroke = new Uint8Array([0, 1])
    const result = remove(2, 1, new Uint8ClampedArray(8), stroke, false)
    const { request, transfer } = sent[0]
    expect(request).toMatchObject({ op: 'remove', width: 2, height: 1, closeLoops: false })
    if (request.op !== 'remove') throw new Error('a removal was sent')
    expect(Array.from(new Uint8Array(request.stroke))).toEqual([0, 1])
    expect(request.stroke).not.toBe(stroke.buffer)
    expect(transfer).toEqual([request.pixels, request.stroke])
    const removal = { rect: { x: 1, y: 0, width: 1, height: 1 }, pixels: new Uint8ClampedArray([9, 9, 9, 255]) }
    worker.reply({ id: request.id, removal })
    await expect(result).resolves.toEqual(removal)
  })

  it('closes loops unless told otherwise', () => {
    const { worker, sent } = fakeWorker()
    void createAlgorithms(() => worker).remove(1, 1, new Uint8ClampedArray(4), new Uint8Array(1))
    expect(sent[0].request).toMatchObject({ op: 'remove', closeLoops: true })
  })

  it('creates one worker, lazily, and matches answers to their requests', async () => {
    const { worker, sent } = fakeWorker()
    const make = vi.fn(() => worker)
    const { objectSelect, remove } = createAlgorithms(make)
    expect(make).not.toHaveBeenCalled()
    const first = objectSelect(1, 1, new Uint8ClampedArray(4), point)
    const second = remove(1, 1, new Uint8ClampedArray(4), new Uint8Array(1))
    expect(make).toHaveBeenCalledTimes(1)
    worker.reply({ id: sent[1].request.id, removal: null })
    worker.reply({ id: sent[0].request.id, error: 'no image' })
    await expect(second).resolves.toBeNull()
    await expect(first).rejects.toThrow('no image')
  })

  it('rejects what is pending when the worker fails, and starts a new one next time', async () => {
    const workers = [fakeWorker(), fakeWorker()]
    const make = vi.fn(() => workers[make.mock.calls.length - 1].worker)
    const { objectSelect } = createAlgorithms(make)
    const pending = objectSelect(1, 1, new Uint8ClampedArray(4), point)
    workers[0].worker.fail()
    await expect(pending).rejects.toThrow('boom')
    expect(workers[0].worker.terminate).toHaveBeenCalled()
    void objectSelect(1, 1, new Uint8ClampedArray(4), point)
    expect(make).toHaveBeenCalledTimes(2)
    expect(workers[1].sent).toHaveLength(1)
  })
})
