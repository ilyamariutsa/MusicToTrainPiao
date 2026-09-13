import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const build = join(import.meta.dirname, '..', 'build')
const sizes = [16, 24, 32, 48, 64, 256]
const pngs = sizes.map((size) => readFileSync(join(build, `icon-${size}.png`)))

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)

let offset = 6 + 16 * sizes.length
const entries = sizes.map((size, index) => {
  const entry = Buffer.alloc(16)
  const dim = size >= 256 ? 0 : size
  entry.writeUInt8(dim, 0)
  entry.writeUInt8(dim, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngs[index].length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += pngs[index].length
  return entry
})

const ico = Buffer.concat([header, ...entries, ...pngs])
writeFileSync(join(build, 'icon.ico'), ico)
console.log(`icon.ico ${ico.length} bytes, frames: ${sizes.join(', ')}`)
