// The built WebAssembly module, inlined by Vite (`npm test` builds it first; see scripts/build-wasm.mjs).
import dataUrl from '../wasm/farbtopf-algo.wasm?inline'

export function wasmBytes(): Uint8Array<ArrayBuffer> {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
