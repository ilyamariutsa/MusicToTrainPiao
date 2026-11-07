import { Midi } from '@tonejs/midi'
import type { Piece, ScoreNote } from '../types'
import { estimateDifficulty } from './difficulty'
import { assignFingering } from './fingering'
import { humanizeFileName, isGenericCredit } from './pieceTitle'
import { pedalSpans, uid } from './theory'

/** Grid in steps per beat: sixteenths (6), eighth triplets (8) and thirty-seconds (3) all land on it. */
const GRID = 24
const snap = (beats: number): number => Math.round(beats * GRID) / GRID
/** Onsets closer than this (a 64th) are one chord played slightly unevenly. */
const CHORD_SPREAD = 0.0625

export function importMidi(buffer: ArrayBuffer, fileName: string): Piece {
  const midi = new Midi(buffer)
  const raw: Array<{ midi: number; start: number; length: number; velocity: number }> = []
  const pedalEvents: Array<{ time: number; down: boolean }> = []
  const ppq = midi.header.ppq || 480
  const tempo = Math.round(midi.header.tempos[0]?.bpm ?? 90)

  for (const track of midi.tracks) {
    // General MIDI channel 10 is drums: its "pitches" are drum sounds, not notes.
    if (track.instrument.percussion || track.channel === 9) continue
    for (const note of track.notes) {
      raw.push({ midi: note.midi, start: note.ticks / ppq, length: note.durationTicks / ppq, velocity: note.velocity })
    }
    // Sustain pedal (CC 64): keep only the moments it actually goes down or up.
    let down = false
    for (const change of track.controlChanges[64] ?? []) {
      const next = change.value >= 0.5
      if (next === down) continue
      down = next
      pedalEvents.push({ time: snap(change.ticks / ppq), down })
    }
  }
  if (raw.length === 0) throw new Error('В MIDI-файле нет нот для фортепиано')

  // Played-in files drift by a few ticks: a rolled chord becomes one chord, then onsets snap to the grid.
  raw.sort((a, b) => a.start - b.start)
  const notes: ScoreNote[] = []
  const seen = new Set<string>()
  let chordStart = Number.NEGATIVE_INFINITY
  let chordTime = 0
  for (const note of raw) {
    if (note.start - chordStart > CHORD_SPREAD) {
      chordStart = note.start
      chordTime = snap(note.start)
    }
    const key = `${chordTime}|${note.midi}`
    if (seen.has(key)) continue
    seen.add(key)
    notes.push({
      id: uid('n'),
      midi: note.midi,
      duration: Math.max(0.25, snap(note.start + note.length) - chordTime),
      time: chordTime,
      clef: note.midi < 60 ? 'bass' : 'treble',
      velocity: Math.round(note.velocity * 1000) / 1000
    })
  }

  assignFingering(notes)
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi)
  const pedal = pedalSpans(pedalEvents, Math.max(...notes.map((note) => note.time + note.duration)))

  const fromFile = humanizeFileName(fileName)
  const headerTitle = midi.header.name?.trim() ?? ''
  const title = !isGenericCredit(headerTitle) && !headerTitle.includes('_') ? headerTitle : fromFile.title
  // A track's instrument ("Acoustic Grand Piano") is not a composer; only the file name may say who it is.
  const composer = fromFile.composer || 'Неизвестный автор'

  return {
    id: uid('imp'),
    title,
    composer,
    source: 'imported',
    group: estimateDifficulty({ notes, tempo }),
    favorite: false,
    timeSignature: readTime(midi),
    keySignature: midi.header.keySignatures[0]?.key
      ? fifthsFromKey(midi.header.keySignatures[0].key)
      : 0,
    tempo,
    notes,
    ...(pedal.length ? { pedal } : {}),
    createdAt: new Date().toISOString(),
    practiceSeconds: 0
  }
}

function readTime(midi: Midi): [number, number] {
  const ts = midi.header.timeSignatures[0]
  if (!ts) return [4, 4]
  const value = ts.timeSignature
  if (Array.isArray(value) && value.length >= 2) return [value[0], value[1]]
  return [4, 4]
}

function fifthsFromKey(key: string): number {
  const map: Record<string, number> = {
    Cb: -7,
    Gb: -6,
    Db: -5,
    Ab: -4,
    Eb: -3,
    Bb: -2,
    F: -1,
    C: 0,
    G: 1,
    D: 2,
    A: 3,
    E: 4,
    B: 5,
    'F#': 6,
    'C#': 7
  }
  const root = key.replace(/m$/, '')
  return map[root] ?? 0
}
