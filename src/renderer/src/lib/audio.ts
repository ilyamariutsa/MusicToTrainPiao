import * as Tone from 'tone'

let synth: Tone.PolySynth | null = null

function ensureSynth(): Tone.PolySynth {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 48,
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.01,
        decay: 0.28,
        sustain: 0.25,
        release: 0.9
      }
    }).toDestination()
    synth.volume.value = -6
  }
  return synth
}

export async function initAudio(): Promise<void> {
  await Tone.start()
  ensureSynth()
}

export function playNote(midi: number, durationSec = 0.45, velocity = 0.8): void {
  const s = ensureSynth()
  s.triggerAttackRelease(Tone.Frequency(midi, 'midi').toNote(), durationSec, Tone.now(), velocity)
}

export function playNotes(midis: number[], durationSec = 0.45, velocity = 0.7): void {
  if (midis.length === 0) return
  const s = ensureSynth()
  s.triggerAttackRelease(
    midis.map((m) => Tone.Frequency(m, 'midi').toNote()),
    durationSec,
    Tone.now(),
    velocity
  )
}

export function releaseAll(): void {
  synth?.releaseAll()
}

export function getTransport(): typeof Tone.Transport {
  return Tone.getTransport()
}

export function now(): number {
  return Tone.now()
}

export { Tone }
