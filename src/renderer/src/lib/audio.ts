import * as Tone from 'tone'

/**
 * Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0): a Yamaha C5 recorded every
 * minor third from A0 to C8. Tone.Sampler repitches the notes in between by at most
 * a semitone and a half, so every key sounds like the real instrument.
 */
const SAMPLE_URLS = import.meta.glob('../assets/piano/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

/** "Ds4.mp3" → "D#4". */
function sampleMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [path, url] of Object.entries(SAMPLE_URLS)) {
    const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.mp3$/, '')
    map[file.replace(/^([A-G])s/, '$1#')] = url
  }
  return map
}

let bus: Tone.ToneAudioNode | null = null
let piano: Tone.Sampler | null = null
let pianoReady = false
let fallback: Tone.PolySynth | null = null

/** Everything plays through a small room reverb and a limiter, so chords never clip. */
function output(): Tone.ToneAudioNode {
  if (!bus) {
    const limiter = new Tone.Limiter(-1).toDestination()
    bus = new Tone.Reverb({ decay: 2.4, preDelay: 0.012, wet: 0.14 }).connect(limiter)
  }
  return bus
}

/** Starts fetching and decoding the samples; safe to call before the first click. */
export function loadPiano(): void {
  if (piano) return
  piano = new Tone.Sampler({
    urls: sampleMap(),
    attack: 0,
    release: 1.1,
    curve: 'exponential',
    onload: () => {
      pianoReady = true
    },
    onerror: (error) => {
      console.warn('Сэмплы рояля не загрузились, играет синтезатор', error)
    }
  }).connect(output())
  // A single mezzo-forte note peaks around −10 dBFS, level with the old synth; the limiter catches chords.
  piano.volume.value = 4
}

export function isPianoReady(): boolean {
  return pianoReady
}

/** Plays while the samples are still loading or if they failed. */
function ensureFallback(): Tone.PolySynth {
  if (!fallback) {
    fallback = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: 48,
      options: {
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.01,
          decay: 0.28,
          sustain: 0.25,
          release: 0.9
        }
      }
    }).connect(output())
    fallback.volume.value = -6
  }
  return fallback
}

export async function initAudio(): Promise<void> {
  await Tone.start()
  loadPiano()
}

export function playNote(midi: number, durationSec = 0.45, velocity = 0.8, time?: number): void {
  playNotes([midi], durationSec, velocity, time)
}

/** `time` is an AudioContext time; pass the scheduler's time so playback stays on the beat. */
export function playNotes(midis: number[], durationSec = 0.45, velocity = 0.7, time?: number): void {
  if (midis.length === 0) return
  const notes = midis.map((m) => Tone.Frequency(m, 'midi').toNote())
  const at = time ?? Tone.now()
  const gain = Math.min(1, Math.max(0.05, velocity))
  if (piano && pianoReady) piano.triggerAttackRelease(notes, durationSec, at, gain)
  else ensureFallback().triggerAttackRelease(notes, durationSec, at, gain)
}

export function releaseAll(): void {
  piano?.releaseAll()
  fallback?.releaseAll()
}

/** 0–100 %, on a squared curve so the slider feels even to the ear. */
export function setMasterVolume(percent: number): void {
  const level = Math.min(100, Math.max(0, percent)) / 100
  const destination = Tone.getDestination()
  destination.mute = level === 0
  if (level > 0) destination.volume.value = Tone.gainToDb(level * level)
}

export function getTransport(): typeof Tone.Transport {
  return Tone.getTransport()
}

export function now(): number {
  return Tone.now()
}

export { Tone }
