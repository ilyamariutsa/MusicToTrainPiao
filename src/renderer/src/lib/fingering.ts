import type { Finger, ScoreNote } from '../types'
import { isWhiteKey, noteHand } from './theory'

const TIME_EPS = 0.03

function asFinger(value: number): Finger {
  return Math.min(5, Math.max(1, Math.round(value))) as Finger
}

/** How many white keys sit at or below this MIDI note, from C-1. */
export function whiteIndex(midi: number): number {
  const octave = Math.floor(midi / 12)
  const pc = ((midi % 12) + 12) % 12
  const below = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
  return octave * 7 + below[pc]
}

function nearestWhiteBelow(midi: number): number {
  let key = midi
  while (key > 0 && !isWhiteKey(key)) key -= 1
  return key
}

function groupByTime(notes: ScoreNote[]): ScoreNote[][] {
  const sorted = [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi)
  const groups: ScoreNote[][] = []
  for (const note of sorted) {
    const last = groups[groups.length - 1]
    if (last && Math.abs(last[0].time - note.time) < TIME_EPS) last.push(note)
    else groups.push([note])
  }
  return groups
}

function uniquify(fingers: Finger[]): Finger[] {
  const used = new Set<Finger>()
  return fingers.map((finger) => {
    if (!used.has(finger)) {
      used.add(finger)
      return finger
    }
    for (const delta of [1, -1, 2, -2, 3, -3, 4, -4]) {
      const next = asFinger(finger + delta)
      if (!used.has(next)) {
        used.add(next)
        return next
      }
    }
    return finger
  })
}

/**
 * One unique finger per sounding pitch.
 * Intervals follow common beginner voicings (Cortot / Russian school):
 * 2nd–3rd → 1–2, 4th → 1–3, 5th → 1–4/5, triad → 1–3–5 or 1–2–4.
 */
function chordFingers(midis: number[], isRight: boolean): Finger[] {
  const order = midis.map((midi, index) => ({ midi, index })).sort((a, b) => a.midi - b.midi)
  const sorted = order.map((item) => item.midi)
  const count = sorted.length
  let rising: Finger[] = []

  if (count <= 1) {
    rising = [isRight ? 3 : 3]
  } else if (count === 2) {
    const interval = sorted[1] - sorted[0]
    if (interval <= 3) rising = [1, 2]
    else if (interval <= 5) rising = [1, 3]
    else if (interval <= 7) rising = [1, 4]
    else rising = [1, 5]
  } else if (count === 3) {
    const span = sorted[2] - sorted[0]
    rising = span <= 6 ? [1, 2, 4] : [1, 3, 5]
  } else if (count === 4) {
    rising = [1, 2, 3, 5]
  } else {
    rising = sorted.map((_, i) => asFinger(1 + (i * 4) / Math.max(1, count - 1)))
    rising = uniquify(rising)
  }

  if (!isRight) rising = rising.map((finger) => asFinger(6 - finger))
  rising = uniquify(rising)

  const byMidi = new Map<number, Finger>()
  order.forEach((item, i) => byMidi.set(item.midi, rising[i] ?? 3))
  return midis.map((midi) => byMidi.get(midi) ?? 3)
}

function stretchFinger(midi: number, minMidi: number, maxMidi: number, isRight: boolean): Finger {
  const minW = whiteIndex(nearestWhiteBelow(minMidi))
  const maxW = whiteIndex(nearestWhiteBelow(maxMidi))
  const here = whiteIndex(nearestWhiteBelow(midi))
  const t = (here - minW) / Math.max(1, maxW - minW)
  return asFinger(isRight ? 1 + t * 4 : 5 - t * 4)
}

function fingerInPosition(midi: number, homeWhite: number, isRight: boolean): Finger {
  const white = whiteIndex(nearestWhiteBelow(midi))
  const home = whiteIndex(homeWhite)
  const delta = white - home
  const finger = isRight ? 1 + delta : 5 - delta
  return asFinger(finger)
}

function avoidAwkwardBlack(midi: number, finger: Finger): Finger {
  if (isWhiteKey(midi)) return finger
  if (finger === 1) return 2
  if (finger === 5) return 4
  return finger
}

function scorePosition(notes: ScoreNote[], home: number, isRight: boolean): number {
  let score = 0
  const pc = ((home % 12) + 12) % 12
  if (pc === 0 || pc === 5) score += 8

  for (const note of notes) {
    const finger = fingerInPosition(note.midi, home, isRight)
    const white = whiteIndex(nearestWhiteBelow(note.midi))
    const homeW = whiteIndex(home)
    const delta = white - homeW
    if (delta < 0) score -= 40
    if (delta > 5) score -= 12 * (delta - 5)
    else score += 10
    if (!isWhiteKey(note.midi) && (finger === 1 || finger === 5)) score -= 36
    if (finger === 2 || finger === 3) score += 3
  }
  return score
}

function bestHome(notes: ScoreNote[], isRight: boolean): number {
  const minMidi = Math.min(...notes.map((note) => note.midi))
  const maxMidi = Math.max(...notes.map((note) => note.midi))
  const span = whiteIndex(maxMidi) - whiteIndex(minMidi)
  if (span <= 5) return nearestWhiteBelow(minMidi)

  let best = nearestWhiteBelow(minMidi)
  let bestScore = Number.NEGATIVE_INFINITY
  for (let midi = minMidi - 8; midi <= minMidi + 2; midi += 1) {
    if (!isWhiteKey(midi)) continue
    const score = scorePosition(notes, midi, isRight)
    if (score > bestScore) {
      bestScore = score
      best = midi
    }
  }
  return best
}

/** Chromatic neighbor groups like E–D#–E get 3–2–3, then the rest of the phrase is positioned normally. */
function assignNeighborRuns(line: ScoreNote[], _isRight: boolean, overwrite: boolean): void {
  let i = 0
  while (i < line.length) {
    let end = i + 1
    const pitches = new Set<number>([line[i].midi])
    while (end < line.length) {
      const nextPitches = new Set(pitches)
      nextPitches.add(line[end].midi)
      if (nextPitches.size > 2) break
      const pair = [...nextPitches].sort((a, b) => a - b)
      if (pair.length === 2 && pair[1] - pair[0] > 1) break
      pitches.add(line[end].midi)
      end += 1
    }
    const run = line.slice(i, end)
    const unique = [...pitches].sort((a, b) => a - b)
    const first = run[0].midi
    let left = false
    let returns = false
    for (const note of run) {
      if (note.midi !== first) left = true
      else if (left) returns = true
    }
    if (run.length >= 3 && unique.length === 2 && returns) {
      for (const note of run) {
        if (!overwrite && note.finger) continue
        note.finger = avoidAwkwardBlack(note.midi, (note.midi === unique[1] ? 3 : 2) as Finger)
      }
      i = end
      continue
    }
    i += 1
  }
}

function melodyChunks(groups: ScoreNote[][]): ScoreNote[][] {
  const chunks: ScoreNote[][] = []
  let current: ScoreNote[] = []

  const span = (notes: ScoreNote[]): number => {
    const midis = notes.map((note) => note.midi)
    return whiteIndex(Math.max(...midis)) - whiteIndex(Math.min(...midis))
  }

  for (const group of groups) {
    if (group.length > 1) {
      if (current.length) chunks.push(current)
      current = []
      continue
    }
    const trial = [...current, group[0]]
    if (current.length && span(trial) > 5) {
      const added = group[0]
      const prev = current[current.length - 1]
      const leap = Math.abs(added.midi - prev.midi) >= 5
      if (leap && span(trial) <= 7) {
        current = trial
      } else {
        chunks.push(current)
        current = [group[0]]
      }
    } else {
      current = trial
    }
  }
  if (current.length) chunks.push(current)
  return chunks
}

function sanitizeChordGroup(group: ScoreNote[], isRight: boolean): void {
  if (group.length < 2) return
  const uniqueMidis = new Set(group.map((note) => note.midi))
  if (uniqueMidis.size < 2) return

  const used = new Map<Finger, number>()
  let illegal = group.some((note) => !note.finger)
  for (const note of group) {
    if (!note.finger) continue
    const prev = used.get(note.finger)
    if (prev != null && prev !== note.midi) illegal = true
    used.set(note.finger, note.midi)
  }
  if (!illegal) return

  const fingers = chordFingers(
    group.map((note) => note.midi),
    isRight
  )
  group.forEach((note, index) => {
    note.finger = fingers[index]
  })
}

/**
 * Pedagogical fingering for beginners:
 * closed five-finger position per phrase, unique fingers in a chord,
 * left hand mirrored (5 on the low key, 1 on the high key),
 * no thumb/pinky on black keys.
 */
export function assignFingering(notes: ScoreNote[], opts?: { overwrite?: boolean }): ScoreNote[] {
  const overwrite = opts?.overwrite ?? false

  const applyHand = (handNotes: ScoreNote[], isRight: boolean): void => {
    const groups = groupByTime(handNotes)

    for (const group of groups) {
      if (group.length > 1) {
        const fingers = chordFingers(
          group.map((note) => note.midi),
          isRight
        )
        group.forEach((note, index) => {
          if (overwrite || !note.finger) note.finger = fingers[index]
        })
        sanitizeChordGroup(group, isRight)
      }
    }

    for (const chunk of melodyChunks(groups)) {
      const minMidi = Math.min(...chunk.map((note) => note.midi))
      const maxMidi = Math.max(...chunk.map((note) => note.midi))
      const span = whiteIndex(maxMidi) - whiteIndex(minMidi)
      const home = bestHome(chunk, isRight)
      for (const note of chunk) {
        if (!overwrite && note.finger) continue
        const finger =
          span >= 6
            ? stretchFinger(note.midi, minMidi, maxMidi, isRight)
            : fingerInPosition(note.midi, home, isRight)
        note.finger = avoidAwkwardBlack(note.midi, finger)
      }
    }

    assignNeighborRuns(
      groups.filter((group) => group.length === 1).map((group) => group[0]),
      isRight,
      overwrite
    )

    let lastFinger: Finger | null = null
    let lastMidi: number | null = null
    for (const group of groups) {
      if (group.length !== 1) {
        lastFinger = group[0]?.finger ?? lastFinger
        lastMidi = group[0]?.midi ?? lastMidi
        continue
      }
      const note = group[0]
      if (!note.finger) {
        if (lastMidi != null && lastFinger != null && note.midi === lastMidi) {
          note.finger = lastFinger
        } else {
          note.finger = isRight ? 3 : 3
        }
      }
      lastFinger = note.finger
      lastMidi = note.midi
    }
  }

  applyHand(
    notes.filter((note) => noteHand(note) === 'right'),
    true
  )
  applyHand(
    notes.filter((note) => noteHand(note) === 'left'),
    false
  )

  for (const group of groupByTime(notes.filter((note) => noteHand(note) === 'right'))) {
    sanitizeChordGroup(group, true)
  }
  for (const group of groupByTime(notes.filter((note) => noteHand(note) === 'left'))) {
    sanitizeChordGroup(group, false)
  }

  return notes
}

export function rhScaleFingers(count: number): Finger[] {
  const pattern: Finger[] = [1, 2, 3, 1, 2, 3, 4]
  const fingers: Finger[] = []
  for (let i = 0; i < count - 1; i += 1) fingers.push(pattern[i % 7])
  fingers.push(5)
  return fingers
}

export function lhScaleFingers(count: number): Finger[] {
  const first: Finger[] = [5, 4, 3, 2, 1, 3, 2]
  const rest: Finger[] = [4, 3, 2, 1, 3, 2, 1]
  const fingers: Finger[] = []
  for (let i = 0; i < count - 1; i += 1) {
    if (i < 7) fingers.push(first[i])
    else if (i === 7) fingers.push(1)
    else fingers.push(rest[(i - 8) % 7])
  }
  fingers.push(1)
  return fingers
}
