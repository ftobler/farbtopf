// Builds the WebAssembly image algorithms in wasm/ and copies the module to
// src/wasm/farbtopf-algo.wasm, where the app imports it. Needs cargo and the
// wasm32-unknown-unknown target (`rustup target add wasm32-unknown-unknown`).
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const manifest = join(root, 'wasm', 'Cargo.toml')
execFileSync('cargo', ['build', '--manifest-path', manifest, '--release', '--target', 'wasm32-unknown-unknown'], {
  stdio: 'inherit',
})
mkdirSync(join(root, 'src', 'wasm'), { recursive: true })
copyFileSync(
  join(root, 'wasm', 'target', 'wasm32-unknown-unknown', 'release', 'farbtopf_algo.wasm'),
  join(root, 'src', 'wasm', 'farbtopf-algo.wasm'),
)
