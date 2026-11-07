import type { Finger, Piece, PieceGroup, ScoreNote } from '../types'
import { assignFingering, lhScaleFingers, rhScaleFingers } from './fingering'
import { parseNotaDsl } from './notaDsl'
import { uid } from './theory'

function builtin(dsl: string): Piece {
  try {
    const piece = parseNotaDsl(dsl)
    // Fingers written below are the teacher's; the rest are suggested.
    assignFingering(piece.notes, { overwrite: false })
    piece.source = 'builtin'
    piece.createdAt = '2026-01-01T00:00:00.000Z'
    return piece
  } catch (error) {
    console.error('Не разобралась встроенная пьеса', error)
    throw error
  }
}

// Built-in pieces in the .nota format (see README). Both hands add up to the same length;
// upbeats are written with `pickup:`, rests with `r`. Fingers after a dot are the teacher's.
const RAW = [
  `
id: yolochka
title: В лесу родилась ёлочка
composer: Л. Бекман
group: beginner
tempo: 96
time: 2/4
key: 0
pickup: e
---
RH: G4e E5e E5e D5e E5e C5e G4e G4e G4e E5e E5e F5e D5e G5qd G5e A5e A5e F5e F5e E5e D5e C5e C5e E5e E5e D5e E5e C5qd
LH: re C3h C3h G2h C3h F2h C3h G2h C3qd
`,
  `
id: ode-to-joy
title: Ода к радости
composer: Л. ван Бетховен
group: beginner
tempo: 100
time: 4/4
key: 0
---
RH: E4q.3 E4q.3 F4q.4 G4q.5 G4q.5 F4q.4 E4q.3 D4q.2 C4q.1 C4q.1 D4q.2 E4q.3 E4qd.3 D4e.2 D4h.2 E4q.3 E4q.3 F4q.4 G4q.5 G4q.5 F4q.4 E4q.3 D4q.2 C4q.1 C4q.1 D4q.2 E4q.3 D4qd.2 C4e.1 C4h.1
LH: C3h G2h C3h G2h C3h G2h C3h G2h C3h G2h C3h G2h C3h G2h G2h C3h
`,
  `
id: happy-birthday
title: С днём рождения
composer: П. и М. Хилл
group: beginner
tempo: 92
time: 3/4
key: 0
pickup: q
---
RH: G4e G4e A4q G4q C5q B4h G4e G4e A4q G4q D5q C5h G4e G4e G5q E5q C5q B4q A4q F5e F5e E5q C5q D5q C5h
LH: rq C3hd G2hd G2hd C3hd C3hd F2hd C3h G2q C3h
`,
  `
id: twinkle
title: Звёздочка
composer: Народная
group: beginner
tempo: 90
time: 4/4
key: 0
---
RH: C4q C4q G4q G4q A4q A4q G4h F4q F4q E4q E4q D4q D4q C4h G4q G4q F4q F4q E4q E4q D4h G4q G4q F4q F4q E4q E4q D4h C4q C4q G4q G4q A4q A4q G4h F4q F4q E4q E4q D4q D4q C4h
LH: C3h C3h F2h C3h F2h C3h G2h C3h C3h F2h C3h G2h C3h F2h C3h G2h C3h C3h F2h C3h F2h C3h G2h C3h
`,
  `
id: minuet-g
title: Менуэт соль мажор (начало)
composer: Х. Петцольд
group: intermediate
tempo: 88
time: 3/4
key: 1
---
RH: D5q.5 G4e.1 A4e.2 B4e.3 C5e.4 D5q.5 G4q.1 G4q.1 E5q.3 C5e.1 D5e.2 E5e.3 F#5e.4 G5q.5 G4q.1 G4q.1 C5q.3 D5e.4 C5e.3 B4e.2 A4e.1 B4q.2 C5e.3 B4e.2 A4e.1 G4e.2 A4q.3 B4e.4 A4e.3 G4e.2 F#4e.1 G4hd.2
LH: G2hd B2hd C3hd B2hd A2hd G2hd D3hd G2hd
`,
  `
id: fur-elise
title: К Элизе (начало)
composer: Л. ван Бетховен
group: intermediate
tempo: 80
time: 3/8
key: 0 minor
pickup: e
---
RH: E5s.5 D#5s.4 E5s.5 D#5s.4 E5s.5 B4s.2 D5s.4 C5s.3 A4e.1 rs C4s.1 E4s.2 A4s.3 B4e.4 rs E4s.1 G#4s.3 B4s.4 C5e.5 rs E4s.1 E5s.5 D#5s.4 E5s.5 D#5s.4 E5s.5 B4s.2 D5s.4 C5s.3 A4e.1 rs C4s.1 E4s.2 A4s.3 B4e.4 rs E4s.1 C5s.4 B4s.3 A4e.2 re
LH: re rqd A2s.5 E3s.2 A3s.1 rs re E2s.5 E3s.2 G#3s.1 rs re A2s.5 E3s.2 A3s.1 rs re rqd A2s.5 E3s.2 A3s.1 rs re E2s.5 E3s.2 G#3s.1 rs re A2s.5 E3s.2 A3s.1 rs
`,
  `
id: prelude-c
title: Прелюдия до мажор (такты 1–4)
composer: И. С. Бах
group: advanced
tempo: 66
time: 4/4
key: 0
pedal: bar
---
RH: re G4s C5s E5s G4s C5s E5s re G4s C5s E5s G4s C5s E5s re A4s D5s F5s A4s D5s F5s re A4s D5s F5s A4s D5s F5s re G4s D5s F5s G4s D5s F5s re G4s D5s F5s G4s D5s F5s re G4s C5s E5s G4s C5s E5s re G4s C5s E5s G4s C5s E5s
LH: C4s E4s rqd C4s E4s rqd C4s D4s rqd C4s D4s rqd B3s D4s rqd B3s D4s rqd C4s E4s rqd C4s E4s rqd
`
]

export const BUILTIN_PIECES: Piece[] = RAW.map((dsl) => builtin(dsl.trim()))

export function createGeneratedPiece(
  id: string,
  title: string,
  composer: string,
  group: PieceGroup,
  notes: ScoreNote[],
  tempo = 80,
  keySignature = 0
): Piece {
  return {
    id,
    title,
    composer,
    source: 'builtin',
    group,
    favorite: false,
    timeSignature: [4, 4],
    keySignature,
    tempo,
    notes,
    createdAt: '2026-01-01T00:00:00.000Z',
    practiceSeconds: 0
  }
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12]

export function generateScale(tonicMidi: number, octaves: number, title: string, keySignature = 0): Piece {
  const notes: ScoreNote[] = []
  let time = 0
  const seq: number[] = []
  for (let oct = 0; oct < octaves; oct += 1) {
    for (let i = 0; i < 7; i += 1) seq.push(tonicMidi + MAJOR[i] + oct * 12)
  }
  seq.push(tonicMidi + octaves * 12)
  const down = [...seq].reverse().slice(1)
  const rhUp = rhScaleFingers(seq.length)
  const rhDown = [...rhUp].reverse().slice(1)
  const lhUp = lhScaleFingers(seq.length)
  const lhDown = [...lhUp].reverse().slice(1)

  const write = (midis: number[], fingers: Finger[], clef: 'treble' | 'bass', start: number): void => {
    midis.forEach((midi, i) => {
      notes.push({
        id: uid('n'),
        midi,
        duration: 0.5,
        time: start + i * 0.5,
        clef,
        finger: fingers[i] ?? 3
      })
    })
  }

  write(seq, rhUp, 'treble', time)
  write(seq.map((m) => m - 12), lhUp, 'bass', time)
  time += seq.length * 0.5
  write(down, rhDown, 'treble', time)
  write(down.map((m) => m - 12), lhDown, 'bass', time)

  return createGeneratedPiece(`scale-${tonicMidi}-${octaves}`, title, 'Разминка', 'warmup', notes, 70, keySignature)
}

export function generateFiveFinger(tonicMidi = 60): Piece {
  const pattern = [0, 2, 4, 5, 7, 5, 4, 2, 0]
  const rh: Finger[] = [1, 2, 3, 4, 5, 4, 3, 2, 1]
  const lh: Finger[] = [5, 4, 3, 2, 1, 2, 3, 4, 5]
  const notes: ScoreNote[] = []
  pattern.forEach((step, i) => {
    notes.push({
      id: uid('n'),
      midi: tonicMidi + step,
      duration: 0.5,
      time: i * 0.5,
      clef: 'treble',
      finger: rh[i]
    })
    notes.push({
      id: uid('n'),
      midi: tonicMidi - 12 + step,
      duration: 0.5,
      time: i * 0.5,
      clef: 'bass',
      finger: lh[i]
    })
  })
  return createGeneratedPiece('five-finger', 'Пять пальцев — до мажор', 'Разминка', 'warmup', notes, 76)
}

export function generateArpeggio(tonicMidi = 60): Piece {
  const ups = [0, 4, 7, 12, 16, 19, 24]
  const downs = [19, 16, 12, 7, 4, 0]
  const seq = [...ups, ...downs]
  // Two octaves up and down: thumb under after 3 (right hand), 4 over the thumb (left hand).
  const rh: Finger[] = [1, 2, 3, 1, 2, 3, 5, 3, 2, 1, 3, 2, 1]
  const notes: ScoreNote[] = seq.map((step, i) => ({
    id: uid('n'),
    midi: tonicMidi + step,
    duration: 0.5,
    time: i * 0.5,
    clef: 'treble' as const,
    finger: rh[i] ?? 1
  }))
  const lhSeq = seq.map((s) => tonicMidi - 12 + s)
  lhSeq.forEach((midi, i) => {
    notes.push({
      id: uid('n'),
      midi,
      duration: 0.5,
      time: i * 0.5,
      clef: 'bass',
      finger: ([5, 4, 2, 1, 4, 2, 1, 2, 4, 1, 2, 4, 5][i] ?? 5) as Finger
    })
  })
  return createGeneratedPiece('arpeggio-c', 'Арпеджио до мажор', 'Разминка', 'warmup', notes, 68)
}

export function generateCadence(): Piece {
  const chords = [
    [60, 64, 67],
    [65, 69, 72],
    [67, 71, 74],
    [60, 64, 67]
  ]
  const bass = [48, 53, 55, 48]
  const namesFinger: Finger[][] = [
    [1, 3, 5],
    [1, 3, 5],
    [1, 3, 5],
    [1, 3, 5]
  ]
  const notes: ScoreNote[] = []
  chords.forEach((chord, i) => {
    chord.forEach((midi, idx) => {
      notes.push({
        id: uid('n'),
        midi,
        duration: 2,
        time: i * 2,
        clef: 'treble',
        finger: namesFinger[i][idx]
      })
    })
    notes.push({
      id: uid('n'),
      midi: bass[i],
      duration: 2,
      time: i * 2,
      clef: 'bass',
      finger: 5
    })
  })
  assignFingering(notes, { overwrite: false })
  return createGeneratedPiece('cadence-c', 'Каданс I–IV–V–I', 'Разминка', 'warmup', notes, 60)
}

export const WARMUPS = [
  generateScale(60, 1, 'Гамма до мажор, 1 октава'),
  generateScale(60, 2, 'Гамма до мажор, 2 октавы'),
  generateScale(67, 1, 'Гамма соль мажор, 1 октава', 1),
  generateFiveFinger(),
  generateArpeggio(),
  generateCadence()
]
