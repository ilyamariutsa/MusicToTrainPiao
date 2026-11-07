import type { Clef, Finger, Piece, PieceGroup, ScoreBar, ScoreNote } from '../types'
import { beatsPerMeasure, durationTokenToBeats, parsePitch, pieceBars, pieceDuration, roundBeat, uid } from './theory'

type Meta = {
  id: string
  title: string
  composer: string
  group: PieceGroup
  tempo: number
  time: [number, number]
  key: number
  mode: 'major' | 'minor'
  /** Length of the upbeat before bar 1, in beats (0 = none). */
  pickup: number
  /** "bar": the sustain pedal is changed at every bar line. */
  pedal?: 'bar'
  favorite?: boolean
}

const GROUPS: PieceGroup[] = ['beginner', 'intermediate', 'advanced', 'warmup', 'custom']
const DURATION = /^(w|h|q|e|s|t|8|16|32)(d)?$/

function fail(line: string, what: string): never {
  throw new Error(`.nota, строка «${line}»: ${what}`)
}

function parseMeta(block: string): Meta {
  const meta: Partial<Meta> = {}
  for (const raw of block.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon < 0) fail(line, 'ожидается «имя: значение»')
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    switch (key) {
      case 'id':
        meta.id = value
        break
      case 'title':
        meta.title = value
        break
      case 'composer':
        meta.composer = value
        break
      case 'group':
        if (GROUPS.includes(value as PieceGroup)) meta.group = value as PieceGroup
        break
      case 'tempo': {
        const tempo = Number(value)
        if (!Number.isFinite(tempo) || tempo <= 0) fail(line, 'темп — число ударов в минуту, например 90')
        meta.tempo = tempo
        break
      }
      case 'time': {
        const match = value.match(/^(\d+)\s*\/\s*(\d+)$/)
        if (!match) fail(line, 'размер пишется как 3/4 или 6/8')
        meta.time = [Number(match[1]), Number(match[2])]
        break
      }
      case 'key': {
        // "key: -1" or "key: 0 minor"
        const match = value.match(/^(-?\d+)\s*(major|minor|мажор|минор)?$/i)
        if (!match || Math.abs(Number(match[1])) > 7) fail(line, 'ключевые знаки — число от -7 (бемоли) до 7 (диезы)')
        meta.key = Number(match[1])
        if (match[2]) meta.mode = /minor|минор/i.test(match[2]) ? 'minor' : 'major'
        break
      }
      case 'mode':
        if (!/^(major|minor|мажор|минор)$/i.test(value)) fail(line, 'лад — major или minor')
        meta.mode = /minor|минор/i.test(value) ? 'minor' : 'major'
        break
      case 'pickup': {
        // "pickup: e" (an eighth) or "pickup: 0.5" (beats)
        const beats = DURATION.test(value) ? durationTokenToBeats(value) : Number(value)
        if (!Number.isFinite(beats) || beats < 0) fail(line, 'затакт — длительность (e, q…) или число долей')
        meta.pickup = beats
        break
      }
      case 'pedal':
        if (value !== 'bar') fail(line, 'педаль: bar — нажимать заново в каждом такте')
        meta.pedal = 'bar'
        break
      case 'favorite':
        meta.favorite = value === 'true'
        break
    }
  }
  if (!meta.id || !meta.title) throw new Error('В .nota файле нужны id и title')
  return {
    id: meta.id,
    title: meta.title,
    composer: meta.composer ?? 'Неизвестен',
    group: meta.group ?? 'custom',
    tempo: meta.tempo ?? 90,
    time: meta.time ?? [4, 4],
    key: meta.key ?? 0,
    mode: meta.mode ?? 'major',
    pickup: meta.pickup ?? 0,
    pedal: meta.pedal,
    favorite: meta.favorite ?? false
  }
}

/**
 * One hand's line: notes like `E4q.3` (pitch, duration, optional finger), chords `C4q+E4q`,
 * rests `rq` / `rqd`. Returns the notes and where the line ends.
 */
function parseHandLine(line: string, clef: Clef, start: number): { notes: ScoreNote[]; end: number } {
  const tokens = line
    .replace(/^(RH|LH|TREBLE|BASS)\s*:\s*/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const notes: ScoreNote[] = []
  let time = start

  for (const token of tokens) {
    const rest = token.match(/^[rR](w|h|q|e|s|t|8|16|32)(d)?$/)
    if (rest) {
      time = roundBeat(time + durationTokenToBeats(rest[1] + (rest[2] ?? '')))
      continue
    }
    let advance: number | null = null
    for (const part of token.split('+')) {
      const match = part.match(/^([A-Ga-g])([#b]?)(-?\d+)(w|h|q|e|s|t|8|16|32)(d)?(?:\.([1-5]))?$/)
      if (!match) throw new Error(`Непонятный токен ноты: ${part}`)
      // Each chord tone keeps its own length; the line moves on by the first one.
      const duration = durationTokenToBeats(match[4] + (match[5] ?? ''))
      advance ??= duration
      notes.push({
        id: uid('n'),
        midi: parsePitch(`${match[1]}${match[2]}${match[3]}`),
        duration,
        time,
        clef,
        step: match[1].toUpperCase() as ScoreNote['step'],
        alter: match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0,
        ...(match[6] ? { finger: Number(match[6]) as Finger } : {})
      })
    }
    time = roundBeat(time + (advance ?? 0))
  }
  return { notes, end: time }
}

/** Bars for a piece that starts with an upbeat: a short bar 0, then full bars. */
function barsWithPickup(pickup: number, time: [number, number], end: number): ScoreBar[] {
  const full = beatsPerMeasure(time)
  const bars: ScoreBar[] = [{ start: 0, end: roundBeat(pickup), signature: time, number: 0 }]
  for (let start = pickup, number = 1; start < end - 0.001; start += full, number += 1) {
    bars.push({ start: roundBeat(start), end: roundBeat(start + full), signature: time, number })
  }
  return bars
}

export function parseNotaDsl(source: string, fallbackName = 'Импорт'): Piece {
  // Files saved on Windows end lines with \r\n.
  const text = source.replace(/\r\n?/g, '\n')
  const parts = text.split(/^\s*---\s*$/m)
  const meta = parts.length > 1 ? parseMeta(parts[0]) : parseMeta(`id: ${uid('p')}\ntitle: ${fallbackName}\n`)
  const body = parts.length > 1 ? parts.slice(1).join('\n') : parts[0]
  const notes: ScoreNote[] = []
  // Several RH (or LH) lines continue one another.
  const cursor: Record<Clef, number> = { treble: 0, bass: 0 }

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const clef: Clef | null = /^(RH|TREBLE)\s*:/i.test(line)
      ? 'treble'
      : /^(LH|BASS)\s*:/i.test(line)
        ? 'bass'
        : /^([A-Ga-g]|[rR](w|h|q|e|s|t|8|16|32))/.test(line)
          ? 'treble'
          : null
    if (!clef) continue
    const parsed = parseHandLine(line, clef, cursor[clef])
    notes.push(...parsed.notes)
    cursor[clef] = parsed.end
  }

  notes.sort((a, b) => a.time - b.time || a.midi - b.midi)
  const end = Math.max(pieceDuration(notes), cursor.treble, cursor.bass)
  const bars = meta.pickup > 0 ? barsWithPickup(meta.pickup, meta.time, end) : undefined
  const pedal =
    meta.pedal === 'bar'
      ? (bars ?? pieceBars({ notes, timeSignature: meta.time })).map((bar): [number, number] => [bar.start, bar.end])
      : undefined

  return {
    id: meta.id,
    title: meta.title,
    composer: meta.composer,
    source: 'imported',
    group: meta.group,
    favorite: Boolean(meta.favorite),
    timeSignature: meta.time,
    keySignature: meta.key,
    ...(meta.mode === 'minor' ? { mode: 'minor' as const } : {}),
    tempo: meta.tempo,
    notes,
    ...(bars ? { bars } : {}),
    ...(pedal ? { pedal } : {}),
    createdAt: new Date().toISOString(),
    practiceSeconds: 0
  }
}
