// Builds the app a second time for base '/' and packs it into
// dist/farbtopf-static.zip, a ready-to-serve deployment for any web root.
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import { build } from 'vite'

const ZIP_NAME = 'farbtopf-static.zip'
const root = join(import.meta.dirname, '..')

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
}

// Minimal zip writer (deflate, no zip64) using Node built-ins only.
function createZip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed to extract
    local.writeUInt16LE(0x0800, 6) // UTF-8 file names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10) // time 00:00
    local.writeUInt16LE(0x21, 12) // date 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed to extract
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)

    offset += local.length + nameBuf.length + compressed.length
  }
  const centralSize = centrals.reduce((size, buf) => size + buf.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

// Flags the build so it hides the (absent) self-hosting download button.
process.env.VITE_SELF_HOSTED = 'true'

// Build into a temp dir outside dist so the zip never ends up inside itself.
const outDir = await mkdtemp(join(tmpdir(), 'farbtopf-static-'))
try {
  await build({
    root,
    base: '/',
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true },
  })
  const files = await Promise.all(
    (await listFiles(outDir)).map(async (path) => ({
      name: relative(outDir, path).split(sep).join('/'),
      data: await readFile(path),
    })),
  )
  const zip = createZip(files)
  await writeFile(join(root, 'dist', ZIP_NAME), zip)
  console.log(`dist/${ZIP_NAME}  ${(zip.length / 1024).toFixed(1)} kB (${files.length} files)`)
} finally {
  await rm(outDir, { recursive: true, force: true })
}
