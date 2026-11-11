import { describe, expect, it, vi } from 'vitest'
import { createObjectSelect } from './objectSelect'
import type { ObjectSelectRequest, ObjectSelectResponse, WorkerLike } from './objectSelect'

/** A stand-in worker that records requests and answers when told to. */
function fakeWorker() {
  const sent: { request: ObjectSelectRequest; transfer: Transferable[] }[] = []
  const worker: WorkerLike & { reply(response: ObjectSelectResponse): void; fail(): void } = {
    onmessage: null,
    onerror: null,
    postMessage(request: ObjectSelectRequest, transfer: Transferable[]) {
      sent.push({ request, transfer })
    },
    terminate: vi.fn(),
    reply(response) {
      worker.onmessage?.({ data: response } as MessageEvent<ObjectSelectResponse>)
    },
    fail() {
      worker.onerror?.({ message: 'boom' } as ErrorEvent)
    },
  }
  return { worker, sent }
}

describe('createObjectSelect', () => {
  it('sends a copy of the pixels with the target and resolves with the selection', async () => {
    const { worker, sent } = fakeWorker()
    const select = createObjectSelect(() => worker)
    const pixels = new Uint8ClampedArray([1, 2, 3, 4])
    const result = select(1, 1, pixels, { kind: 'point', point: { x: 0, y: 0 } })
    expect(sent).toHaveLength(1)
    const { request, transfer } = sent[0]
    expect(request).toMatchObject({ width: 1, height: 1, target: { kind: 'point', point: { x: 0, y: 0 } } })
    expect(Array.from(new Uint8ClampedArray(request.pixels))).toEqual([1, 2, 3, 4])
    expect(transfer).toEqual([request.pixels])
    expect(request.pixels).not.toBe(pixels.buffer)
    const selection = { rect: { x: 0, y: 0, width: 1, height: 1 }, mask: null }
    worker.reply({ id: request.id, selection })
    await expect(result).resolves.toEqual(selection)
  })

  it('creates one worker, lazily, and matches answers to their requests', async () => {
    const { worker, sent } = fakeWorker()
    const make = vi.fn(() => worker)
    const select = createObjectSelect(make)
    expect(make).not.toHaveBeenCalled()
    const first = select(1, 1, new Uint8ClampedArray(4), { kind: 'point', point: { x: 0, y: 0 } })
    const second = select(1, 1, new Uint8ClampedArray(4), { kind: 'point', point: { x: 0, y: 0 } })
    expect(make).toHaveBeenCalledTimes(1)
    worker.reply({ id: sent[1].request.id, selection: null })
    worker.reply({ id: sent[0].request.id, error: 'no image' })
    await expect(second).resolves.toBeNull()
    await expect(first).rejects.toThrow('no image')
  })

  it('rejects what is pending when the worker fails, and starts a new one next time', async () => {
    const workers = [fakeWorker(), fakeWorker()]
    const make = vi.fn(() => workers[make.mock.calls.length - 1].worker)
    const select = createObjectSelect(make)
    const pending = select(1, 1, new Uint8ClampedArray(4), { kind: 'point', point: { x: 0, y: 0 } })
    workers[0].worker.fail()
    await expect(pending).rejects.toThrow('boom')
    expect(workers[0].worker.terminate).toHaveBeenCalled()
    void select(1, 1, new Uint8ClampedArray(4), { kind: 'point', point: { x: 0, y: 0 } })
    expect(make).toHaveBeenCalledTimes(2)
    expect(workers[1].sent).toHaveLength(1)
  })
})
