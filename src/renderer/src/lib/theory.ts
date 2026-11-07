import type { Piece, ScoreBar, ScoreNote } from '../types'

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
export type Spelled = { step: Step; alter: number; octave: number }
/** A score's own spelling of a note, when it has one. */
export type GivenSpelling = { step?: Step; alter?: number }

const STEPS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const STEP_PC: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const STEP_RU: Record<Step, string> = { C: 'До', D: 'Ре', E: 'Ми', F: 'Фа', G: 'Соль', A: 'Ля', B: 'Си' }
const mod12 = (value: number): number => ((value % 12) + 12) % 12

const MAJOR_KEYS: Record<number, string> = {
  [-7]: 'До♭ мажор', [-6]: 'Соль♭ мажор', [-5]: 'Ре♭ мажор', [-4]: 'Ля♭ мажор', [-3]: 'Ми♭ мажор',
  [-2]: 'Си♭ мажор', [-1]: 'Фа мажор', 0: 'До мажор', 1: 'Соль мажор', 2: 'Ре мажор', 3: 'Ля мажор',
  4: 'Ми мажор', 5: 'Си мажор', 6: 'Фа♯ мажор', 7: 'До♯ мажор'
}
const MINOR_KEYS: Record<number, string> = {
  [-7]: 'Ля♭ минор', [-6]: 'Ми♭ минор', [-5]: 'Си♭ минор', [-4]: 'Фа минор', [-3]: 'До минор',
  [-2]: 'Соль минор', [-1]: 'Ре минор', 0: 'Ля минор', 1: 'Ми минор', 2: 'Си минор', 3: 'Фа♯ минор',
  4: 'До♯ минор', 5: 'Соль♯ минор', 6: 'Ре♯ минор', 7: 'Ля♯ минор'
}

/** "Ля минор", "Ре мажор". */
export function keyName(fifths: number, mode: 'major' | 'minor' = 'major'): string {
  return (mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS)[fifths] ?? 'До мажор'
}

const SHARP_LETTERS: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_LETTERS: Step[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

/** What the key signature does to a letter: +1 sharp, -1 flat, 0 none. */
export function keyAlter(step: Step, fifths: number): number {
  if (fifths > 0 && SHARP_LETTERS.slice(0, fifths).includes(step)) return 1
  if (fifths < 0 && FLAT_LETTERS.slice(0, -fifths).includes(step)) return -1
  return 0
}

function spelled(midi: number, step: Step, alter: number): Spelled {
  // C♭4 is B3 in pitch, B♯3 is C4: the octave belongs to the letter.
  return { step, alter, octave: Math.floor((midi - STEP_PC[step] - alter) / 12) - 1 }
}

/**
 * How a pitch is written. The score's own spelling wins; otherwise the note of the key's
 * scale, then the raised 6th and 7th of the relative minor (F♯ in G minor, G♯ in A minor),
 * then sharps in sharp keys and flats in flat keys.
 */
export function spell(midi: number, fifths = 0, given?: GivenSpelling): Spelled {
  if (given?.step) return spelled(midi, given.step, given.alter ?? 0)
  const pc = mod12(midi)
  for (const step of STEPS) {
    const alter = keyAlter(step, fifths)
    if (mod12(STEP_PC[step] + alter) === pc) return spelled(midi, step, alter)
  }
  const minorTonic = mod12(7 * fifths + 9)
  const raised = pc === mod12(minorTonic + 11) || pc === mod12(minorTonic + 9)
  const shift = raised || fifths >= 0 ? 1 : -1
  for (const step of STEPS) {
    const alter = keyAlter(step, fifths) + shift
    if (mod12(STEP_PC[step] + alter) === pc) return spelled(midi, step, alter)
  }
  const fallback: Array<[Step, number]> = [
    ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]
  ]
  const [step, alter] = fallback[pc]
  return spelled(midi, step, alter)
}

const ALTER_TEXT: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' }
const ALTER_RU: Record<number, string> = { [-2]: '♭♭', [-1]: '♭', 0: '', 1: '♯', 2: '♯♯' }

/** "F#4", "Bb3". */
export function midiToName(midi: number, keySignature = 0, given?: GivenSpelling): string {
  const s = spell(midi, keySignature, given)
  return `${s.step}${ALTER_TEXT[s.alter] ?? ''}${s.octave}`
}

/** "Фа♯ 4", "Си♭ 3". */
export function midiToRu(midi: number, keySignature = 0, given?: GivenSpelling): string {
  const s = spell(midi, keySignature, given)
  return `${STEP_RU[s.step]}${ALTER_RU[s.alter] ?? ''} ${s.octave}`
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

export type Accidental = '#' | 'b' | 'n' | '##' | 'bb'

/** VexFlow key ("f/4") and the accidental of the spelling itself (ignoring the key signature). */
export function midiToVexKey(midi: number, keySignature = 0, given?: GivenSpelling): { key: string; accidental?: Accidental } {
  const s = spell(midi, keySignature, given)
  const key = `${s.step.toLowerCase()}/${s.octave}`
  const accidental = ({ [-2]: 'bb', [-1]: 'b', 1: '#', 2: '##' } as Record<number, Accidental>)[s.alter]
  return accidental ? { key, accidental } : { key }
}

/**
 * Accidentals to print in one bar of one staff, in time order: a sign is shown when the
 * note differs from what the key signature or an earlier note in the bar already says,
 * so F♯ then F in C major gets ♯ then ♮, and a repeated F♯ gets no second sign.
 */
export function barAccidentals(
  notes: Array<{ id: string; midi: number; time: number; step?: Step; alter?: number; tied?: boolean }>,
  keySignature: number
): Map<string, Accidental | undefined> {
  const state = new Map<string, number>()
  const out = new Map<string, Accidental | undefined>()
  for (const note of [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi)) {
    // A note tied over the bar line repeats no sign and does not set one for the bar.
    if (note.tied) {
      out.set(note.id, undefined)
      continue
    }
    const s = spell(note.midi, keySignature, note)
    const place = `${s.step}${s.octave}`
    const current = state.get(place) ?? keyAlter(s.step, keySignature)
    if (s.alter === current) out.set(note.id, undefined)
    else out.set(note.id, s.alter === 0 ? 'n' : ({ [-2]: 'bb', [-1]: 'b', 1: '#', 2: '##' } as Record<number, Accidental>)[s.alter])
    state.set(place, s.alter)
  }
  return out
}

export function uid(prefix = 'n'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

export function pieceDuration(notes: ScoreNote[]): number {
  if (notes.length === 0) return 0
  return Math.max(...notes.map((n) => n.time + n.duration))
}

const TIE_EPS = 0.02

/** Notes that are actually struck; a tied continuation only keeps the earlier one sounding. */
export function struck<T extends ScoreNote>(notes: T[]): T[] {
  return notes.filter((n) => !n.tied)
}

/** For every tied note, the note it continues (same pitch, ending exactly where it starts). */
export function tiePredecessors(notes: ScoreNote[]): Map<string, ScoreNote> {
  const sorted = [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi)
  const open = new Map<number, ScoreNote>()
  const previous = new Map<string, ScoreNote>()
  for (const note of sorted) {
    const before = open.get(note.midi)
    if (note.tied && before && Math.abs(before.time + before.duration - note.time) < TIE_EPS) {
      previous.set(note.id, before)
    }
    open.set(note.midi, note)
  }
  return previous
}

/** How long each struck note really sounds, in beats, following its chain of ties. */
export function soundingBeats(notes: ScoreNote[]): Map<string, number> {
  const previous = tiePredecessors(notes)
  const head = new Map<string, ScoreNote>()
  const lengths = new Map<string, number>()
  for (const note of [...notes].sort((a, b) => a.time - b.time)) {
    const before = previous.get(note.id)
    const first = before ? head.get(before.id) ?? before : note
    head.set(note.id, first)
    lengths.set(first.id, note.time + note.duration - first.time)
  }
  return lengths
}

/** Pedal down/up events → held spans. A new "down" while held is a pedal change. */
export function pedalSpans(events: Array<{ time: number; down: boolean }>, end: number): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  let downAt: number | null = null
  for (const event of [...events].sort((a, b) => a.time - b.time)) {
    if (downAt != null && event.time > downAt + 0.001) spans.push([downAt, event.time])
    if (event.down) downAt = downAt != null && event.time <= downAt + 0.001 ? downAt : event.time
    else downAt = null
  }
  if (downAt != null && end > downAt + 0.001) spans.push([downAt, roundBeat(end)])
  return spans
}

/** A note released inside a pedal span keeps sounding until the pedal comes up. */
export function pedalRelease(pedal: Array<[number, number]> | undefined, end: number): number {
  if (!pedal) return end
  for (const [down, up] of pedal) {
    if (down < end - 0.001 && end < up - 0.001) return up
  }
  return end
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

/** Upper staff is the right hand even when both staves are written in treble. */
export function noteHand(note: ScoreNote): 'right' | 'left' {
  if (note.staff === 1) return 'right'
  if (note.staff === 2) return 'left'
  return note.clef === 'bass' ? 'left' : 'right'
}

export function pieceBars(piece: Pick<Piece, 'notes' | 'timeSignature' | 'bars'>): ScoreBar[] {
  if (piece.bars && piece.bars.length > 0) return piece.bars
  const beats = Math.max(0.25, beatsPerMeasure(piece.timeSignature))
  const total = Math.max(pieceDuration(piece.notes), beats)
  const bars: ScoreBar[] = []
  for (let start = 0, number = 1; start < total - 0.001; start += beats, number += 1) {
    bars.push({
      start: roundBeat(start),
      end: roundBeat(start + beats),
      signature: piece.timeSignature,
      number
    })
  }
  return bars
}

export function measureContaining(piece: Pick<Piece, 'notes' | 'timeSignature' | 'bars'>, time: number): ScoreBar {
  const bars = pieceBars(piece)
  return (
    bars.find((bar) => time >= bar.start - 0.001 && time < bar.end - 0.001) ??
    bars[bars.length - 1] ?? {
      start: 0,
      end: beatsPerMeasure(piece.timeSignature),
      signature: piece.timeSignature,
      number: 1
    }
  )
}

export type PhraseSpan = {
  label: string
  detail: string
  start: number
  end: number
}

/** Whole piece plus a handful of practice phrases, about eight on a long work. */
export function phraseBounds(piece: Pick<Piece, 'notes' | 'timeSignature' | 'bars'>): PhraseSpan[] {
  const bars = pieceBars(piece)
  const total = Math.max(pieceDuration(piece.notes), bars[bars.length - 1]?.end ?? 0)
  const all: PhraseSpan = {
    label: 'Вся пьеса',
    detail: bars.length ? `${bars.length} тактов` : 'целиком',
    start: 0,
    end: total
  }
  if (bars.length <= 1) return [all]
  const per = barsPerPhrase(bars.length, bars[0].signature[1])
  const phrases: PhraseSpan[] = [all]
  let index = 1
  for (let i = 0; i < bars.length; i += per) {
    const slice = bars.slice(i, i + per)
    const from = Math.max(1, slice[0].number) // bar 0 is an upbeat
    const to = slice[slice.length - 1].number
    phrases.push({
      label: `Фраза ${index}`,
      detail: from === to ? `такт ${from}` : `такты ${from}–${to}`,
      start: slice[0].start,
      end: slice[slice.length - 1].end
    })
    index += 1
  }
  return phrases
}

function barsPerPhrase(count: number, beatType: number): number {
  if (count <= 4) return count
  const min = beatType >= 8 ? 8 : 4
  if (count <= min * 2) return min
  return Math.max(min, Math.round(count / 8))
}

export function roundBeat(value: number): number {
  return Math.round(value * 1000) / 1000
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
