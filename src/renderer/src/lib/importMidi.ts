import { Midi } from '@tonejs/midi'
import type { Piece, ScoreNote } from '../types'
import { estimateDifficulty } from './difficulty'
import { assignFingering } from './fingering'
import { humanizeFileName, isGenericCredit } from './pieceTitle'
import { uid } from './theory'

export function importMidi(buffer: ArrayBuffer, fileName: string): Piece {
  const midi = new Midi(buffer)
  const notes: ScoreNote[] = []
  const ppq = midi.header.ppq || 480
  const tempo = Math.round(midi.header.tempos[0]?.bpm ?? 90)

  for (const track of midi.tracks) {
    for (const note of track.notes) {
      notes.push({
        id: uid('n'),
        midi: note.midi,
        duration: Math.max(0.25, note.durationTicks / ppq),
        time: note.ticks / ppq,
        clef: note.midi < 60 ? 'bass' : 'treble'
      })
    }
  }

  assignFingering(notes)
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi)

  const fromFile = humanizeFileName(fileName)
  const headerTitle = midi.header.name?.trim() ?? ''
  const title = !isGenericCredit(headerTitle) && !headerTitle.includes('_') ? headerTitle : fromFile.title
  const composerCredit = trackComposer(midi)
  const composer = !isGenericCredit(composerCredit) ? composerCredit : fromFile.composer || 'Неизвестный автор'

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

function trackComposer(midi: Midi): string {
  return midi.tracks.find((t) => t.instrument?.name)?.instrument.name ?? ''
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
