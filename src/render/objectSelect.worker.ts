/// <reference lib="webworker" />
// Runs Object Selection (the WebAssembly module built from wasm/) off the main thread.
import wasmUrl from '../wasm/farbtopf-algo.wasm?url'
import { ObjectSelector } from '../core/objectSelect'
import type { ObjectSelectRequest, ObjectSelectResponse } from './objectSelect'

const scope = self as unknown as DedicatedWorkerGlobalScope

let selector: Promise<ObjectSelector> | null = null

function getSelector(): Promise<ObjectSelector> {
  selector ??= WebAssembly.compileStreaming(fetch(wasmUrl)).then((module) => ObjectSelector.create(module))
  return selector
}

function reply(response: ObjectSelectResponse): void {
  const mask = 'selection' in response ? response.selection?.mask : undefined
  scope.postMessage(response, mask ? [mask.data.buffer] : [])
}

scope.onmessage = async (event: MessageEvent<ObjectSelectRequest>) => {
  const { id, width, height, pixels, target } = event.data
  try {
    const instance = await getSelector()
    instance.load(width, height, new Uint8ClampedArray(pixels))
    reply({ id, selection: instance.select(target) })
  } catch (error) {
    // A trap can leave the module's memory inconsistent: start over on the next request.
    selector = null
    reply({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
