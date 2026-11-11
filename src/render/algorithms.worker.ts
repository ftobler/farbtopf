/// <reference lib="webworker" />
// Runs the image algorithms (the WebAssembly module built from wasm/) off the main thread.
import wasmUrl from '../wasm/farbtopf-algo.wasm?url'
import { Algorithms } from '../core/algorithms'
import type { AlgorithmRequest, AlgorithmResponse } from './algorithms'

const scope = self as unknown as DedicatedWorkerGlobalScope

let algorithms: Promise<Algorithms> | null = null

function getAlgorithms(): Promise<Algorithms> {
  algorithms ??= WebAssembly.compileStreaming(fetch(wasmUrl)).then((module) => Algorithms.create(module))
  return algorithms
}

function reply(response: AlgorithmResponse): void {
  const transfer: Transferable[] = []
  if ('selection' in response && response.selection?.mask) transfer.push(response.selection.mask.data.buffer)
  if ('removal' in response && response.removal) transfer.push(response.removal.pixels.buffer)
  scope.postMessage(response, transfer)
}

scope.onmessage = async (event: MessageEvent<AlgorithmRequest>) => {
  const request = event.data
  const { id, width, height, pixels } = request
  try {
    const instance = await getAlgorithms()
    instance.load(width, height, new Uint8ClampedArray(pixels))
    if (request.op === 'select') reply({ id, selection: instance.select(request.target) })
    else reply({ id, removal: instance.remove(new Uint8Array(request.stroke), request.closeLoops) })
  } catch (error) {
    // A trap can leave the module's memory inconsistent: start over on the next request.
    algorithms = null
    reply({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
