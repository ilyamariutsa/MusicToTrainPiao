import type { Finger, Piece, PieceGroup, ScoreNote } from '../types'
import { assignFingering, lhScaleFingers, rhScaleFingers } from './fingering'
import { parseNotaDsl } from './notaDsl'
import { uid } from './theory'

function builtin(dsl: string): Piece {
  try {
    const piece = parseNotaDsl(dsl)
    assignFingering(piece.notes, { overwrite: true })
    piece.source = 'builtin'
    piece.createdAt = '2026-01-01T00:00:00.000Z'
    return piece
  } catch (error) {
    console.error('Не разобралась встроенная пьеса', error)
    throw error
  }
}

const RAW = [
  `
id: yolochka
title: В лесу родилась ёлочка
composer: Л. Бекман
group: beginner
tempo: 96
time: 2/4
key: 0
---
RH: G4e E5e E5e D5e E5e C5e G4e G4e G4e E5e E5e F5e D5e G5qd G5e A5e A5e F5e F5e E5e D5e C5e C5e E5e E5e D5e E5e C5qd
LH: C3h G2h C3h G2h F2h G2h C3h C3h
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
LH: C3h.5 G2h.1 C3h.5 G2h.1 C3h.5 G2h.1 C3h.5 G2h.1 C3h.5 G2h.1 C3h.5 G2h.1 C3h.5 G2h.1 G2h.1 C3h.5
`,
  `
id: happy-birthday
title: С днём рождения
composer: Народная
group: beginner
tempo: 92
time: 3/4
key: 0
---
RH: G4e.2 G4e.1 A4q.2 G4q.1 C5q.4 B4h.3 G4e.2 G4e.1 A4q.2 G4q.1 D5q.5 C5h.4 G4e.2 G4e.1 G5q.5 E5q.3 C5q.1 B4q.2 A4h.1 F5e.4 F5e.3 E5q.2 C5q.1 D5q.3 C5h.1
LH: C3h.5 G2q.1 C3h.5 G2q.1 F2h.5 C3q.1 G2h.1 C3q.5 C3h.5 G2q.1 F2h.5 G2q.1 C3h.5 G2q.1
`,
  `
id: let-run-clumsy
title: Пусть бегут неуклюже
composer: В. Шаинский
group: beginner
tempo: 108
time: 4/4
key: 0
---
RH: G4q.4 E4q.2 G4q.4 E4q.2 G4q.4 A4q.5 G4h.4 F4q.3 D4q.1 F4q.3 D4q.1 F4q.3 G4q.4 F4h.3 E4q.2 E4q.2 F4q.3 G4q.4 A4q.5 G4q.4 C5h.5 G4q.4 F4q.3 E4q.2 D4q.1 C4w.1
LH: C3h.5 G2h.1 C3h.5 G2h.1 G2h.1 D3h.2 G2h.1 D3h.2 C3h.5 G2h.1 C3h.5 E3h.3 G2h.1 G2h.1 C3w.5
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
RH: C4q.1 C4q.1 G4q.4 G4q.4 A4q.5 A4q.5 G4h.4 F4q.3 F4q.3 E4q.2 E4q.2 D4q.1 D4q.1 C4h.1 G4q.4 G4q.4 F4q.3 F4q.3 E4q.2 E4q.2 D4h.1 G4q.4 G4q.4 F4q.3 F4q.3 E4q.2 E4q.2 D4h.1 C4q.1 C4q.1 G4q.4 G4q.4 A4q.5 A4q.5 G4h.4 F4q.3 F4q.3 E4q.2 E4q.2 D4q.1 D4q.1 C4h.1
LH: C3h.5 G2h.1 C3h.5 G2h.1 F2h.5 C3h.2 G2h.5 C3h.1 C3h.5 G2h.1 C3h.5 G2h.1 C3h.5 G2h.1 C3h.5 G2h.1 C3h.5 G2h.1 F2h.5 C3h.2 G2h.5 C3h.1
`,
  `
id: minuet-g
title: Менуэт соль мажор (начало)
composer: И. С. Бах
group: intermediate
tempo: 88
time: 3/4
key: 1
---
RH: D5q.3 G4e.1 A4e.2 B4e.3 C5e.4 D5q.5 G4q.1 G4q.1 E5q.3 C5e.1 D5e.2 E5e.3 F#5e.4 G5q.5 G4q.1 G4q.1 C5q.3 D5e.4 C5e.3 B4e.2 A4e.1 B4q.2 C5e.3 B4e.2 A4e.1 G4e.2 A4q.3 B4e.4 A4e.3 G4e.2 F#4e.1 G4h.2
LH: G2h.5 B2q.3 D3h.2 D3q.2 C3h.1 E3q.3 D3h.2 B2q.4 A2h.5 D3q.2 G2q.5 D3q.2 D3q.2 G3h.1
`,
  `
id: fur-elise
title: К Элизе (начало)
composer: Л. ван Бетховен
group: intermediate
tempo: 72
time: 3/8
key: 0
---
RH: E5e.3 D#5e.2 E5e.3 D#5e.2 E5e.3 B4e.1 D5e.2 C5e.1 A4qd.1 C4e.1 E4e.2 A4e.3 B4qd.4 E4e.1 G#4e.2 B4e.3 C5qd.5
LH: A2qd.5 A2e.5 E3e.2 A3e.1 E2qd.5 E2e.5 E3e.2 G#3e.1 A2qd.5
`,
  `
id: prelude-c
title: Прелюдия до мажор (фрагмент)
composer: И. С. Бах
group: advanced
tempo: 76
time: 4/4
key: 0
---
RH: E4e.2 G4e.3 C5e.5 E5e.4 G4e.3 C5e.5 E5e.4 G4e.3 E4e.2 G4e.3 C5e.5 E5e.4 G4e.3 C5e.5 E5e.4 G4e.3 D4e.2 G4e.3 D5e.5 F5e.4 G4e.3 D5e.5 F5e.4 G4e.3
LH: C3e.5 E3e.3 C3e.5 E3e.3 C3e.5 E3e.3 C3e.5 E3e.3 C3e.5 E3e.3 C3e.5 E3e.3 C3e.5 E3e.3 C3e.5 E3e.3 B2e.5 D3e.2 B2e.5 D3e.2 B2e.5 D3e.2 B2e.5 D3e.2
`
]

export const BUILTIN_PIECES: Piece[] = RAW.map((dsl) => builtin(dsl.trim()))

export function createGeneratedPiece(
  id: string,
  title: string,
  composer: string,
  group: PieceGroup,
  notes: ScoreNote[],
  tempo = 80
): Piece {
  return {
    id,
    title,
    composer,
    source: 'builtin',
    group,
    favorite: false,
    timeSignature: [4, 4],
    keySignature: 0,
    tempo,
    notes,
    createdAt: new Date().toISOString(),
    practiceSeconds: 0
  }
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12]

export function generateScale(tonicMidi: number, octaves: number, title: string): Piece {
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

  return createGeneratedPiece(`scale-${tonicMidi}-${octaves}`, title, 'Разминка', 'warmup', notes, 70)
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
  const rh: Finger[] = [1, 2, 3, 5, 1, 2, 3, 2, 1, 5, 3, 2, 1]
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
      finger: ([5, 3, 2, 1, 5, 3, 2, 3, 5, 1, 2, 3, 5][i] ?? 5) as Finger
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
  generateScale(67, 1, 'Гамма соль мажор, 1 октава'),
  generateFiveFinger(),
  generateArpeggio(),
  generateCadence()
]
