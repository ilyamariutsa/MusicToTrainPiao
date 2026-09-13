import type { Clef, Finger, Piece, PieceGroup, ScoreNote } from '../types'
import { durationTokenToBeats, parsePitch, uid } from './theory'

type Meta = {
  id: string
  title: string
  composer: string
  group: PieceGroup
  tempo: number
  time: [number, number]
  key: number
  favorite?: boolean
}

function parseMeta(block: string): Meta {
  const meta: Partial<Meta> = {}
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [key, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    switch (key.trim()) {
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
        meta.group = value as PieceGroup
        break
      case 'tempo':
        meta.tempo = Number(value)
        break
      case 'time': {
        const [n, d] = value.split('/').map(Number)
        meta.time = [n, d]
        break
      }
      case 'key':
        meta.key = Number(value)
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
    favorite: meta.favorite ?? false
  }
}

function parseHandLine(line: string, clef: Clef): ScoreNote[] {
  const tokens = line
    .replace(/^(RH|LH|TREBLE|BASS)\s*:\s*/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const notes: ScoreNote[] = []
  let time = 0

  for (const token of tokens) {
    const chordParts = token.split('+')
    let duration = 1
    let first = true
    for (const part of chordParts) {
      const match = part.match(/^([A-Ga-g][#b]?-?\d+)(w|h|q|e|s|t|8|16|32)(d)?(?:\.([1-5]))?$/)
      if (!match) throw new Error(`Непонятный токен ноты: ${part}`)
      const pitch = match[1]
      const durToken = match[2] + (match[3] ?? '')
      if (first) {
        duration = durationTokenToBeats(durToken)
        first = false
      }
      const finger = match[4] ? (Number(match[4]) as Finger) : undefined
      notes.push({
        id: uid('n'),
        midi: parsePitch(pitch),
        duration,
        time,
        clef,
        finger
      })
    }
    time += duration
  }
  return notes
}

export function parseNotaDsl(text: string, fallbackName = 'Импорт'): Piece {
  const parts = text.split(/\n---\n/)
  const meta = parts.length > 1 ? parseMeta(parts[0]) : parseMeta(`id: ${uid('p')}\ntitle: ${fallbackName}\n`)
  const body = parts.length > 1 ? parts[1] : parts[0]
  const notes: ScoreNote[] = []

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (/^(RH|TREBLE)\s*:/i.test(line)) notes.push(...parseHandLine(line, 'treble'))
    else if (/^(LH|BASS)\s*:/i.test(line)) notes.push(...parseHandLine(line, 'bass'))
    else if (/^[A-Ga-g]/.test(line)) notes.push(...parseHandLine(`RH: ${line}`, 'treble'))
  }

  notes.sort((a, b) => a.time - b.time || a.midi - b.midi)

  return {
    id: meta.id,
    title: meta.title,
    composer: meta.composer,
    source: 'imported',
    group: meta.group,
    favorite: Boolean(meta.favorite),
    timeSignature: meta.time,
    keySignature: meta.key,
    tempo: meta.tempo,
    notes,
    createdAt: new Date().toISOString(),
    practiceSeconds: 0
  }
}

export function pieceToDsl(piece: Piece): string {
  const header = [
    `id: ${piece.id}`,
    `title: ${piece.title}`,
    `composer: ${piece.composer}`,
    `group: ${piece.group}`,
    `tempo: ${piece.tempo}`,
    `time: ${piece.timeSignature[0]}/${piece.timeSignature[1]}`,
    `key: ${piece.keySignature}`
  ].join('\n')

  const dur = (beats: number): string => {
    const map: Record<string, string> = {
      '4': 'w',
      '3': 'hd',
      '2': 'h',
      '1.5': 'qd',
      '1': 'q',
      '0.75': '8d',
      '0.5': 'e',
      '0.25': 's'
    }
    return map[String(beats)] ?? 'q'
  }

  const name = (midi: number): string => {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
  }

  const writeHand = (clef: 'treble' | 'bass', prefix: string): string => {
    const hand = piece.notes.filter((n) => n.clef === clef).sort((a, b) => a.time - b.time || a.midi - b.midi)
    if (hand.length === 0) return ''
    const groups = new Map<number, typeof hand>()
    for (const note of hand) {
      const bucket = groups.get(note.time) ?? []
      bucket.push(note)
      groups.set(note.time, bucket)
    }
    const tokens: string[] = []
    for (const time of [...groups.keys()].sort((a, b) => a - b)) {
      const chord = groups.get(time)!
      tokens.push(
        chord
          .map((n) => `${name(n.midi)}${dur(n.duration)}${n.finger ? `.${n.finger}` : ''}`)
          .join('+')
      )
    }
    return `${prefix}: ${tokens.join(' ')}`
  }

  return `${header}\n---\n${writeHand('treble', 'RH')}\n${writeHand('bass', 'LH')}\n`
}
