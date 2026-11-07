import type { Hand, Piece, ScoreNote } from '../types'
import { getTransport, playClick, playNotes, releaseAll, Tone } from './audio'
import { groupNotesAtTime, nextEventTime, noteHand, pedalRelease, pieceBars, soundingBeats, struck } from './theory'

export type PlayerCallbacks = {
  onCursor: (time: number, notes: ScoreNote[]) => void
  onEnd: () => void
}

export function filterByHand(notes: ScoreNote[], hand: Hand): ScoreNote[] {
  if (hand === 'both') return notes
  if (hand === 'right') return notes.filter((n) => noteHand(n) === 'right')
  return notes.filter((n) => noteHand(n) === 'left')
}

export class ScorePlayer {
  private ids: number[] = []
  private playing = false
  /** Bumped on every stop: drawing callbacks already queued by an older run are dropped. */
  private run = 0

  isPlaying(): boolean {
    return this.playing
  }

  stop(): void {
    this.run += 1
    const transport = getTransport()
    for (const id of this.ids) transport.clear(id)
    this.ids = []
    transport.stop()
    transport.cancel()
    transport.position = 0
    releaseAll()
    this.playing = false
  }

  /** Changes the tempo while playing: everything is scheduled in ticks and follows it. */
  setTempo(bpm: number): void {
    getTransport().bpm.value = bpm
  }

  play(piece: Piece, options: { start: number; end: number; tempo: number; hand: Hand; metronome: boolean } & PlayerCallbacks): void {
    this.stop()
    const run = this.run
    const inHand = filterByHand(piece.notes, options.hand)
    // A tied note is struck once and held through its ties; the pedal holds it longer still.
    const lengths = soundingBeats(inHand)
    const notes = struck(inHand)
      .filter((n) => n.time >= options.start - 0.001 && n.time < options.end - 0.001)
      .sort((a, b) => a.time - b.time)

    const transport = getTransport()
    transport.bpm.value = options.tempo
    const at = (beat: number): string => `${Math.max(0, Math.round((beat - options.start) * transport.PPQ))}i`
    const draw = (audioTime: number, fn: () => void): void => {
      Tone.getDraw().schedule(() => {
        if (run === this.run) fn()
      }, audioTime)
    }

    const times = [...new Set(notes.map((n) => n.time))].sort((a, b) => a - b)
    for (const time of times) {
      const chord = groupNotesAtTime(notes, time)
      const id = transport.schedule((audioTime) => {
        const beat = 60 / transport.bpm.value
        for (const note of chord) {
          const end = time + (lengths.get(note.id) ?? note.duration)
          const release = pedalRelease(piece.pedal, end)
          // Without pedal a key comes up a hair early, so repeated notes stay distinct.
          const seconds = release > end ? (release - time) * beat : (end - time) * beat * 0.92
          playNotes([note.midi], Math.max(0.18, seconds), note.velocity ?? 0.7, audioTime)
        }
        draw(audioTime, () => options.onCursor(time, chord))
      }, at(time))
      this.ids.push(id)
    }

    if (options.metronome) {
      for (const tick of metronomeBeats(piece, options.start, options.end)) {
        this.ids.push(transport.schedule((audioTime) => playClick(tick.accent, audioTime), at(tick.time)))
      }
    }

    // The end goes through a plain timer, not Tone.Draw: Draw drops callbacks that come
    // late (minimised window, busy page), and then Stop and the loop would hang.
    const endId = transport.schedule((audioTime) => {
      const delay = Math.max(0, (audioTime - Tone.now()) * 1000)
      window.setTimeout(() => {
        if (run !== this.run) return
        this.playing = false
        options.onEnd()
      }, delay)
    }, at(Math.max(options.end, options.start + 0.05)))
    this.ids.push(endId)

    this.playing = true
    transport.start('+0.05')
  }
}

/** Metronome clicks on the beats of each bar: quarters in 4/4, dotted quarters in 6/8, accent on the downbeat. */
export function metronomeBeats(piece: Piece, start: number, end: number): Array<{ time: number; accent: boolean }> {
  const beats: Array<{ time: number; accent: boolean }> = []
  for (const bar of pieceBars(piece)) {
    if (bar.end <= start + 0.001 || bar.start >= end - 0.001) continue
    const [count, unit] = bar.signature
    const compound = unit === 8 && count > 3 && count % 3 === 0
    const step = compound ? 1.5 : 4 / unit
    for (let i = 0; bar.start + i * step < bar.end - 0.001; i += 1) {
      const time = bar.start + i * step
      if (time >= start - 0.001 && time < end - 0.001) beats.push({ time, accent: i === 0 })
    }
  }
  return beats
}

/** Keys to press: struck notes only, a tied continuation is already held. */
export function playable(notes: ScoreNote[], hand: Hand): ScoreNote[] {
  return struck(filterByHand(notes, hand))
}

export function expectedMidis(notes: ScoreNote[], time: number, hand: Hand): number[] {
  return groupNotesAtTime(playable(notes, hand), time).map((n) => n.midi)
}

export function firstEvent(notes: ScoreNote[], start: number, hand: Hand): number | null {
  const filtered = playable(notes, hand).filter((n) => n.time >= start - 0.001)
  if (filtered.length === 0) return null
  return Math.min(...filtered.map((n) => n.time))
}

export function stepEvent(notes: ScoreNote[], from: number, hand: Hand): number | null {
  return nextEventTime(playable(notes, hand), from)
}
