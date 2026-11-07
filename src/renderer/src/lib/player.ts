import type { Hand, Piece, ScoreNote } from '../types'
import { getTransport, playNotes, releaseAll, Tone } from './audio'
import { groupNotesAtTime, nextEventTime, noteHand, pedalRelease, soundingBeats, struck } from './theory'

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

  isPlaying(): boolean {
    return this.playing
  }

  stop(): void {
    const transport = getTransport()
    for (const id of this.ids) transport.clear(id)
    this.ids = []
    transport.stop()
    transport.cancel()
    transport.position = 0
    releaseAll()
    this.playing = false
  }

  play(piece: Piece, options: { start: number; end: number; tempo: number; hand: Hand; metronome: boolean } & PlayerCallbacks): void {
    this.stop()
    const inHand = filterByHand(piece.notes, options.hand)
    // A tied note is struck once and held through its ties; the pedal holds it longer still.
    const lengths = soundingBeats(inHand)
    const notes = struck(inHand)
      .filter((n) => n.time >= options.start - 0.001 && n.time < options.end - 0.001)
      .sort((a, b) => a.time - b.time)

    const transport = getTransport()
    transport.bpm.value = options.tempo
    const beat = 60 / options.tempo

    const times = [...new Set(notes.map((n) => n.time))].sort((a, b) => a - b)
    for (const time of times) {
      const chord = groupNotesAtTime(notes, time)
      const when = (time - options.start) * beat
      const id = transport.schedule((audioTime) => {
        for (const note of chord) {
          const end = time + (lengths.get(note.id) ?? note.duration)
          const release = pedalRelease(piece.pedal, end)
          // Without pedal a key comes up a hair early, so repeated notes stay distinct.
          const seconds = release > end ? (release - time) * beat : (end - time) * beat * 0.92
          playNotes([note.midi], Math.max(0.18, seconds), note.velocity ?? 0.7, audioTime)
        }
        Tone.getDraw().schedule(() => options.onCursor(time, chord), audioTime)
      }, when)
      this.ids.push(id)
    }

    if (options.metronome) {
      const clicks = Math.ceil((options.end - options.start) / 1)
      for (let i = 0; i <= clicks; i += 1) {
        const id = transport.schedule((audioTime) => {
          const click = new Tone.MembraneSynth({
            envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 }
          }).toDestination()
          click.volume.value = -18
          const isDownbeat =
            Math.round((options.start + i) * piece.timeSignature[1]) % (piece.timeSignature[0] * piece.timeSignature[1]) ===
            0
          click.triggerAttackRelease(isDownbeat ? 'C4' : 'C3', 0.05, audioTime)
          click.dispose()
        }, i * beat)
        this.ids.push(id)
      }
    }

    const endId = transport.schedule((audioTime) => {
      Tone.getDraw().schedule(() => {
        this.playing = false
        options.onEnd()
      }, audioTime)
    }, Math.max(0.05, (options.end - options.start) * beat))
    this.ids.push(endId)

    this.playing = true
    transport.start('+0.05')
  }
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
