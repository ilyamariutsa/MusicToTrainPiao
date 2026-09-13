import type { Finger, ScoreNote } from '../types'

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
export const NOTE_NAMES_RU: Record<string, string> = {
  C: 'До',
  'C#': 'До♯',
  Db: 'Ре♭',
  D: 'Ре',
  'D#': 'Ре♯',
  Eb: 'Ми♭',
  E: 'Ми',
  F: 'Фа',
  'F#': 'Фа♯',
  Gb: 'Соль♭',
  G: 'Соль',
  'G#': 'Соль♯',
  Ab: 'Ля♭',
  A: 'Ля',
  'A#': 'Ля♯',
  Bb: 'Си♭',
  B: 'Си'
}

export const KEY_NAMES: Record<number, string> = {
  [-7]: 'До♭ мажор',
  [-6]: 'Соль♭ мажор',
  [-5]: 'Ре♭ мажор',
  [-4]: 'Ля♭ мажор',
  [-3]: 'Ми♭ мажор',
  [-2]: 'Си♭ мажор',
  [-1]: 'Фа мажор',
  0: 'До мажор',
  1: 'Соль мажор',
  2: 'Ре мажор',
  3: 'Ля мажор',
  4: 'Ми мажор',
  5: 'Си мажор',
  6: 'Фа♯ мажор',
  7: 'До♯ мажор'
}

const FLAT_KEYS = new Set([-1, -2, -3, -4, -5, -6, -7])

export function midiToName(midi: number, keySignature = 0): string {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  const names = FLAT_KEYS.has(keySignature) ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP
  return `${names[pc]}${octave}`
}

export function midiToRu(midi: number, keySignature = 0): string {
  const name = midiToName(midi, keySignature)
  const pitch = name.replace(/-?\d+$/, '')
  const octave = name.match(/-?\d+$/)?.[0] ?? ''
  return `${NOTE_NAMES_RU[pitch] ?? pitch} ${octave}`
}

export function parsePitch(token: string): number {
  const match = token.match(/^([A-Ga-g])([#b]?)(-?\d+)$/)
  if (!match) throw new Error(`Непонятная нота: ${token}`)
  const letter = match[1].toUpperCase()
  const acc = match[2]
  const octave = Number(match[3])
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let pc = base[letter]
  if (acc === '#') pc += 1
  if (acc === 'b') pc -= 1
  return (octave + 1) * 12 + pc
}

export function durationTokenToBeats(token: string): number {
  const dotted = token.endsWith('d')
  const base = dotted ? token.slice(0, -1) : token
  const map: Record<string, number> = {
    w: 4,
    h: 2,
    q: 1,
    e: 0.5,
    '8': 0.5,
    s: 0.25,
    '16': 0.25,
    t: 0.125,
    '32': 0.125
  }
  const beats = map[base]
  if (!beats) throw new Error(`Непонятная длительность: ${token}`)
  return dotted ? beats * 1.5 : beats
}

export function beatsToVexDuration(beats: number): { duration: string; dotted: boolean } {
  const table: Array<{ beats: number; duration: string; dotted: boolean }> = [
    { beats: 4, duration: 'w', dotted: false },
    { beats: 3, duration: 'h', dotted: true },
    { beats: 2, duration: 'h', dotted: false },
    { beats: 1.5, duration: 'q', dotted: true },
    { beats: 1, duration: 'q', dotted: false },
    { beats: 0.75, duration: '8', dotted: true },
    { beats: 0.5, duration: '8', dotted: false },
    { beats: 0.375, duration: '16', dotted: true },
    { beats: 0.25, duration: '16', dotted: false }
  ]
  let best = table[0]
  let diff = Math.abs(beats - best.beats)
  for (const item of table) {
    const next = Math.abs(beats - item.beats)
    if (next < diff) {
      best = item
      diff = next
    }
  }
  return { duration: best.duration, dotted: best.dotted }
}

export function midiToVexKey(midi: number, keySignature = 0): { key: string; accidental?: '#' | 'b' | 'n' } {
  const name = midiToName(midi, keySignature)
  const pitch = name.replace(/-?\d+$/, '')
  const octave = name.match(/-?\d+$/)?.[0] ?? '4'
  const letter = pitch[0].toLowerCase()
  if (pitch.includes('#')) return { key: `${letter}/${octave}`, accidental: '#' }
  if (pitch.includes('b')) return { key: `${letter}/${octave}`, accidental: 'b' }
  return { key: `${letter}/${octave}` }
}

export function uid(prefix = 'n'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

export function pieceDuration(notes: ScoreNote[]): number {
  if (notes.length === 0) return 0
  return Math.max(...notes.map((n) => n.time + n.duration))
}

export function groupNotesAtTime(notes: ScoreNote[], time: number, epsilon = 0.02): ScoreNote[] {
  return notes.filter((n) => Math.abs(n.time - time) < epsilon)
}

export function nextEventTime(notes: ScoreNote[], after: number): number | null {
  const times = [...new Set(notes.map((n) => n.time))].filter((t) => t > after + 0.001).sort((a, b) => a - b)
  return times[0] ?? null
}

export function notesInWindow(notes: ScoreNote[], start: number, end: number): ScoreNote[] {
  return notes.filter((n) => n.time >= start - 0.001 && n.time < end - 0.001)
}

export function beatsPerMeasure(timeSignature: [number, number]): number {
  return (timeSignature[0] * 4) / timeSignature[1]
}

export function sectionBounds(notes: ScoreNote[], timeSignature: [number, number], measuresPerSection = 4) {
  const total = pieceDuration(notes)
  const bpm = beatsPerMeasure(timeSignature)
  const sectionBeats = bpm * measuresPerSection
  const sections: Array<{ label: string; start: number; end: number }> = [
    { label: 'Всё произведение', start: 0, end: total }
  ]
  if (total <= sectionBeats) return sections
  let index = 1
  for (let start = 0; start < total; start += sectionBeats) {
    sections.push({
      label: `Фраза ${index}`,
      start,
      end: Math.min(start + sectionBeats, total)
    })
    index += 1
  }
  return sections
}

export function isWhiteKey(midi: number): boolean {
  return [0, 2, 4, 5, 7, 9, 11].includes(((midi % 12) + 12) % 12)
}

const OCTAVE_RU = ['субконтр.', 'контр.', 'большая', 'малая', '1-я', '2-я', '3-я', '4-я', '5-я']

export function octaveIndex(midi: number): number {
  return Math.floor(midi / 12) - 1
}

export function octaveRu(midi: number): string {
  return OCTAVE_RU[octaveIndex(midi)] ?? `${octaveIndex(midi)}`
}

export const FINGER_RU: Record<Finger, string> = {
  1: 'большой',
  2: 'указательный',
  3: 'средний',
  4: 'безымянный',
  5: 'мизинец'
}

export const FINGER_HINT: Record<Finger, string> = {
  1: 'Большой — крайний, смотрит в сторону большого пальца другой руки',
  2: 'Указательный — следующий после большого',
  3: 'Средний — самый длинный',
  4: 'Безымянный — рядом с мизинцем, поначалу слабее остальных',
  5: 'Мизинец — крайний с внешней стороны ладони'
}

export function clefForMidi(midi: number): 'treble' | 'bass' {
  return midi >= 60 ? 'treble' : 'bass'
}

export function staffPlaceRu(midi: number): string {
  if (midi === 60) return 'До первой октавы — между ключами, на добавочной линейке'
  if (midi === 67) return 'Соль 1-й октавы — 2-я линейка скрипичного ключа (ключ «живёт» на ней)'
  if (midi === 53) return 'Фа малой октавы — 4-я линейка басового ключа (ключ «живёт» на ней)'
  if (midi === 64) return 'Ми 1-й октавы — 1-я линейка скрипичного ключа'
  if (midi === 71) return 'Си 1-й октавы — 3-я линейка скрипичного'
  if (midi === 62) return 'Ре 1-й октавы — 1-й промежуток скрипичного'
  if (midi === 55) return 'Соль малой — 2-й промежуток басового, чуть ниже до первой'
  if (midi === 48) return 'До малой — 2-я линейка басового ключа'
  return midi >= 60 ? 'Скрипичный ключ, правая рука' : 'Басовый ключ, левая рука'
}

export function beatsToRu(beats: number): string {
  const items: Array<{ beats: number; name: string; symbol: string }> = [
    { beats: 4, name: 'целая', symbol: '𝅝' },
    { beats: 3, name: 'половинная с точкой', symbol: '𝅗𝅥.' },
    { beats: 2, name: 'половинная', symbol: '𝅗𝅥' },
    { beats: 1.5, name: 'четверть с точкой', symbol: '♩.' },
    { beats: 1, name: 'четверть', symbol: '♩' },
    { beats: 0.75, name: 'восьмая с точкой', symbol: '♪.' },
    { beats: 0.5, name: 'восьмая', symbol: '♪' },
    { beats: 0.25, name: 'шестнадцатая', symbol: '♬' }
  ]
  let best = items[0]
  let diff = Math.abs(beats - best.beats)
  for (const item of items) {
    const next = Math.abs(beats - item.beats)
    if (next < diff) {
      best = item
      diff = next
    }
  }
  return best.name
}

export function beatsToSymbol(beats: number): string {
  if (beats >= 3.5) return 'w'
  if (beats >= 2.5) return 'h.'
  if (beats >= 1.75) return 'h'
  if (beats >= 1.25) return 'q.'
  if (beats >= 0.85) return '♩'
  if (beats >= 0.6) return '♪.'
  if (beats >= 0.35) return '♪'
  return '16'
}

export function fingerForScale(positionFromTonic: number, hand: 'right' | 'left', direction: 'up' | 'down'): Finger {
  const rhUp = [1, 2, 3, 1, 2, 3, 4] as const
  const lhUp = [5, 4, 3, 2, 1, 3, 2] as const
  const pattern = hand === 'right' ? rhUp : lhUp
  const idx = ((positionFromTonic % 7) + 7) % 7
  if (direction === 'up') return pattern[idx]
  if (hand === 'right') {
    const rhDown = [5, 4, 3, 2, 1, 3, 2] as const
    return rhDown[idx]
  }
  const lhDown = [1, 2, 3, 1, 2, 3, 4] as const
  return lhDown[idx]
}
