const FONT = '"Noto Music","Segoe UI Symbol",serif'
const WHOLE = '\u{1D15D}'

export type GlyphFit = {
  size: number
  dx: number
  dy: number
}

const cache = new Map<string, GlyphFit>()

function inkBox(char: string, fontSize: number): { dx: number; dy: number; inkW: number; inkH: number } {
  const canvas = document.createElement('canvas')
  const box = Math.ceil(fontSize * 4)
  canvas.width = box
  canvas.height = box
  const ctx = canvas.getContext('2d')
  if (!ctx) return { dx: 0, dy: 0, inkW: 0, inkH: 0 }
  ctx.clearRect(0, 0, box, box)
  ctx.font = `${fontSize}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#000'
  ctx.fillText(char, box / 2, box / 2)
  const pixels = ctx.getImageData(0, 0, box, box).data
  let minX = box
  let minY = box
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < box; y += 1) {
    for (let x = 0; x < box; x += 1) {
      if (pixels[(y * box + x) * 4 + 3] > 24) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX) return { dx: 0, dy: 0, inkW: 0, inkH: 0 }
  return {
    dx: (minX + maxX) / 2 - box / 2,
    dy: (minY + maxY) / 2 - box / 2,
    inkW: maxX - minX + 1,
    inkH: maxY - minY + 1
  }
}

/** Size the whole-note glyph so its ink matches the staff space, then center that ink. */
export function fitWholeNote(targetHeight: number): GlyphFit {
  const key = `w:${Math.round(targetHeight * 10)}`
  const hit = cache.get(key)
  if (hit) return hit
  const probe = inkBox(WHOLE, 48)
  if (probe.inkH < 1) {
    const fallback = { size: targetHeight * 2.15, dx: 0, dy: 0 }
    cache.set(key, fallback)
    return fallback
  }
  const size = 48 * (targetHeight / probe.inkH)
  const fitted = inkBox(WHOLE, size)
  const result = { size, dx: fitted.dx, dy: fitted.dy }
  cache.set(key, result)
  return result
}

export const WHOLE_NOTE = WHOLE
export const MUSIC_FONT = FONT
