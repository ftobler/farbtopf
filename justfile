

build:
    npm run build


dev:
    npm run dev


test:
    npm run test


typecheck:
    npm run typecheck


lint:
    npm run lint


install:
    npm install


# Builds the WebAssembly image algorithms (wasm/) into src/wasm/.
wasm:
    node scripts/build-wasm.mjs


wasm-test:
    cargo test --manifest-path wasm/Cargo.toml --release
