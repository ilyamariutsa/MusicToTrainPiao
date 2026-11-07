import type { Finger, ScoreNote } from '../types'
import { isWhiteKey, noteHand } from './theory'

const TIME_EPS = 0.03
const FINGERS: Finger[] = [1, 2, 3, 4, 5]

function asFinger(value: number): Finger {
  return Math.min(5, Math.max(1, Math.round(value))) as Finger
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
    rising = [3]
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
    rising = uniquify(sorted.map((_, i) => asFinger(1 + (i * 4) / Math.max(1, count - 1))))
  }

  if (!isRight) rising = rising.map((finger) => asFinger(6 - finger))
  rising = uniquify(rising)

  const byMidi = new Map<number, Finger>()
  order.forEach((item, i) => byMidi.set(item.midi, rising[i] ?? 3))
  return midis.map((midi) => byMidi.get(midi) ?? 3)
}

function sanitizeChordGroup(group: ScoreNote[], isRight: boolean): void {
  if (group.length < 2) return
  if (new Set(group.map((note) => note.midi)).size < 2) return
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
 * Comfortable and possible distances, in semitones, between two fingers of the right hand,
 * measured from the lower-numbered finger's key to the higher one's (Parncutt et al., 1997):
 * [practical min, comfortable min, relaxed min, relaxed max, comfortable max, practical max].
 * Negative distances with the thumb are the thumb passing under (or a finger over the thumb).
 */
const SPAN: Record<string, [number, number, number, number, number, number]> = {
  '12': [-5, -3, 1, 5, 8, 10],
  '13': [-4, -2, 3, 7, 10, 12],
  '14': [-3, -1, 5, 9, 12, 14],
  '15': [-1, 1, 7, 10, 13, 15],
  '23': [1, 1, 1, 2, 3, 5],
  '24': [1, 1, 3, 4, 5, 7],
  '25': [2, 2, 5, 6, 8, 10],
  '34': [1, 1, 1, 2, 2, 4],
  '35': [1, 1, 3, 4, 5, 7],
  '45': [1, 1, 1, 2, 3, 5]
}

/** Effort of playing `to` with finger f2 right after `from` with finger f1. */
function moveCost(from: number, f1: Finger, to: number, f2: Finger, isRight: boolean): number {
  const step = to - from
  if (f1 === f2) return step === 0 ? 0 : 8 + Math.abs(step)
  const low = Math.min(f1, f2)
  const high = Math.max(f1, f2)
  // Distance from the lower-numbered finger to the higher one, mirrored for the left hand.
  let span = f2 > f1 ? step : -step
  if (!isRight) span = -span
  const [minPrac, minComf, minRel, maxRel, maxComf, maxPrac] = SPAN[`${low}${high}`]
  let cost = 0
  if (span < minComf) cost += 2 * (minComf - span)
  if (span > maxComf) cost += 2 * (span - maxComf)
  if (span < 0) {
    // The thumb passing under (or a finger over it): fine in scales with 3 and 4, but each
    // crossing costs a little, and crossing with the index finger is awkward.
    cost += 4 + (low === 1 && high === 2 ? 8 : 0)
  } else if (span < minRel) {
    cost += (minRel - span) * (low === 1 ? 2 : 1)
  }
  if (span > maxRel) cost += span - maxRel
  if (span < minPrac || span > maxPrac) cost += 25
  return cost
}

/** Effort of a single key under a finger: thumb and little finger are awkward on black keys. */
function keyCost(midi: number, finger: Finger): number {
  if (isWhiteKey(midi)) return 0
  if (finger === 1) return 3
  if (finger === 5) return 1.5
  return 0
}

type Slot = { midi: number; options: Finger[]; notes: ScoreNote[]; chord?: Array<{ midi: number; finger: Finger }>; time: number }

/**
 * Fingering for one hand: chords keep their block fingering; every run of single notes
 * between them is fingered as the cheapest path (Viterbi) — the thumb passes under in
 * scales, the same finger never plays two different keys in a row, a long pause lets the
 * hand move freely.
 */
function fingerLine(groups: ScoreNote[][], isRight: boolean, overwrite: boolean): void {
  let run: Slot[] = []
  let before: Slot | null = null
  const flush = (): void => {
    if (run.length) solveRun(run, before, isRight, overwrite)
    run = []
  }
  for (const group of groups) {
    if (group.length > 1 && new Set(group.map((note) => note.midi)).size > 1) {
      flush()
      const fingers = chordFingers(
        group.map((note) => note.midi),
        isRight
      )
      group.forEach((note, i) => {
        if (overwrite || !note.finger) note.finger = fingers[i]
      })
      sanitizeChordGroup(group, isRight)
      before = { midi: group[0].midi, options: [], notes: group, time: group[0].time, chord: group.map((note) => ({ midi: note.midi, finger: note.finger ?? 3 })) }
      continue
    }
    const note = group[0]
    const fixed = !overwrite && note.finger
    run.push({ midi: note.midi, options: fixed ? [note.finger as Finger] : FINGERS, notes: group, time: note.time })
  }
  flush()
}

function solveRun(run: Slot[], chordBefore: Slot | null, isRight: boolean, overwrite: boolean): void {
  const weight = (from: number, to: number): number => (to - from >= 2 ? 0.2 : 1)
  const back: Array<Map<Finger, Finger>> = []
  let costs = new Map<Finger, number>()
  run.forEach((slot, i) => {
    const next = new Map<Finger, number>()
    const from = new Map<Finger, Finger>()
    for (const f2 of slot.options) {
      let best = Number.POSITIVE_INFINITY
      let bestFrom: Finger = f2
      if (i === 0) {
        if (chordBefore?.chord) {
          // The chord tone nearest to this note stands in for the chord.
          const tone = chordBefore.chord.reduce((a, b) => (Math.abs(b.midi - slot.midi) < Math.abs(a.midi - slot.midi) ? b : a))
          best = moveCost(tone.midi, tone.finger, slot.midi, f2, isRight) * weight(chordBefore.time, slot.time)
        } else best = 0
      } else {
        const prev = run[i - 1]
        for (const [f1, base] of costs) {
          const total = base + moveCost(prev.midi, f1, slot.midi, f2, isRight) * weight(prev.time, slot.time)
          if (total < best) {
            best = total
            bestFrom = f1
          }
        }
      }
      next.set(f2, best + keyCost(slot.midi, f2))
      from.set(f2, bestFrom)
    }
    costs = next
    back.push(from)
  })
  let pick = [...costs.entries()].reduce((a, b) => (b[1] < a[1] ? b : a))[0]
  for (let i = run.length - 1; i >= 0; i -= 1) {
    for (const note of run[i].notes) if (overwrite || !note.finger) note.finger = pick
    pick = back[i].get(pick) ?? pick
  }
}

/**
 * Suggested fingering: block fingering for chords, an effort-minimising path for melodies
 * (thumb under in scales, no repeated finger on different keys, thumb and fifth off the
 * black keys where possible). Fingers already in the score are kept unless `overwrite`.
 */
export function assignFingering(notes: ScoreNote[], opts?: { overwrite?: boolean }): ScoreNote[] {
  const overwrite = opts?.overwrite ?? false
  // A tied continuation is held, not played: it has no finger of its own.
  const pressed = notes.filter((note) => !note.tied)
  for (const isRight of [true, false]) {
    const hand = pressed.filter((note) => (noteHand(note) === 'right') === isRight)
    if (hand.length === 0) continue
    // Voices are fingered separately only when the hand really has several lines.
    const voices = [...new Set(hand.map((note) => note.voice ?? 1))]
    const lines = voices.length > 1 ? voices.map((v) => hand.filter((note) => (note.voice ?? 1) === v)) : [hand]
    for (const line of lines) fingerLine(groupByTime(line), isRight, overwrite)
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
