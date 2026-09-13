import { readFileSync } from 'fs'

const src = readFileSync(new URL('../src/renderer/src/lib/pieces.ts', import.meta.url), 'utf8')
const blocks = [...src.matchAll(/`\s*id:[\s\S]*?`/g)].map((m) => m[0].slice(1, -1).trim())
console.log(`Найдено встроенных партитур в исходнике: ${blocks.length}`)
if (blocks.length < 6) {
  console.error('Ожидалось не меньше 6 пьес')
  process.exit(1)
}
console.log('OK')
