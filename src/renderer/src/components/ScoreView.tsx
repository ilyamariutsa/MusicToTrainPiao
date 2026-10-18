import { useEffect, useRef } from 'react'
import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow'
import {
  beatsToVexDuration,
  displayAccidental,
  measureContaining,
  midiToVexKey,
  noteHand,
  notesInWindow,
  pieceBars,
  roundBeat
} from '../lib/theory'
import type { Clef, Piece, ScoreBar, ScoreNote } from '../types'

type Props = {
  piece: Piece
  cursorTime: number
  activeIds?: string[]
  fromBeat?: number
}

type Tick = {
  keys: string[]
  accidentals: Array<'#' | 'b' | 'n' | undefined>
  duration: string
  dotted: boolean
  rest: boolean
  ids: string[]
  stemUp: boolean
}

function fillTicks(notes: ScoreNote[], start: number, beats: number, keySignature: number, restKey: string, stemUp: boolean): Tick[] {
  const inBar = notesInWindow(notes, start, start + beats).sort((a, b) => a.time - b.time || a.midi - b.midi)
  const ticks: Tick[] = []
  let cursor = start
  const groups = new Map<number, ScoreNote[]>()
  for (const note of inBar) {
    const key = roundBeat(note.time)
    const bucket = groups.get(key) ?? []
    bucket.push(note)
    groups.set(key, bucket)
  }

  const pushRest = (dur: number): void => {
    if (dur <= 0.05) return
    const vex = beatsToVexDuration(dur)
    ticks.push({
      keys: [restKey],
      accidentals: [undefined],
      duration: `${vex.duration}r`,
      dotted: vex.dotted,
      rest: true,
      ids: [],
      stemUp
    })
  }

  for (const time of [...groups.keys()].sort((a, b) => a - b)) {
    const gap = time - cursor
    if (gap > 0.08) pushRest(gap)
    const chord = groups.get(time)!
    const unique = [...new Map(chord.map((note) => [note.midi, note])).values()].sort((a, b) => a.midi - b.midi)
    const dur = Math.min(...unique.map((note) => note.duration), start + beats - time)
    const vex = beatsToVexDuration(Math.max(0.125, dur))
    ticks.push({
      keys: unique.map((note) => midiToVexKey(note.midi, keySignature).key),
      accidentals: unique.map((note) => displayAccidental(note.midi, keySignature)),
      duration: vex.duration,
      dotted: vex.dotted,
      rest: false,
      ids: unique.map((note) => note.id),
      stemUp
    })
    cursor = time + dur
  }
  if (start + beats - cursor > 0.08) pushRest(start + beats - cursor)
  if (ticks.length === 0) {
    const vex = beatsToVexDuration(beats)
    ticks.push({
      keys: [restKey],
      accidentals: [undefined],
      duration: `${vex.duration}r`,
      dotted: vex.dotted,
      rest: true,
      ids: [],
      stemUp
    })
  }
  return ticks
}

function toStaveNotes(ticks: Tick[], clef: Clef, activeIds: Set<string>): StaveNote[] {
  return ticks.map((tick) => {
    const note = new StaveNote({
      clef,
      keys: tick.keys,
      duration: tick.duration,
      autoStem: tick.rest
    })
    if (!tick.rest) note.setStemDirection(tick.stemUp ? 1 : -1)
    tick.accidentals.forEach((acc, idx) => {
      if (acc) note.addModifier(new Accidental(acc), idx)
    })
    if (tick.dotted) Dot.buildAndAttach([note], { all: true })
    if (tick.ids.some((id) => activeIds.has(id))) {
      note.setStyle({ fillStyle: '#8a5a2b', strokeStyle: '#8a5a2b' })
    } else {
      note.setStyle({ fillStyle: '#1b1814', strokeStyle: '#1b1814' })
    }
    return note
  })
}

function staffClef(notes: ScoreNote[], staff: 1 | 2): Clef {
  const own = notes.find((note) => (note.staff ?? (noteHand(note) === 'right' ? 1 : 2)) === staff)
  if (own) return own.clef
  return staff === 1 ? 'treble' : 'bass'
}

export function ScoreView({ piece, cursorTime, activeIds = [], fromBeat }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''

    const bars = pieceBars(piece)
    const anchor = fromBeat ?? measureContaining(piece, cursorTime).start
    let index = bars.findIndex((bar) => Math.abs(bar.start - anchor) < 0.02)
    if (index < 0) index = Math.max(0, bars.findIndex((bar) => anchor >= bar.start - 0.001 && anchor < bar.end - 0.001))
    const opener = bars[index] ?? measureContaining(piece, cursorTime)
    const shownCount = opener.signature[1] >= 8 && opener.signature[0] <= 3 ? 4 : 2
    const shown = bars.slice(index, index + shownCount)
    if (shown.length === 0) return

    const width = Math.max(640, host.clientWidth || 860)
    const height = 320
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(width, height)
    const ctx = renderer.getContext()
    ctx.setFont('Palatino Linotype', 13)

    const active = new Set(activeIds)
    const staveWidth = (width - 28) / shown.length

    shown.forEach((bar, i) => {
      drawMeasure(ctx, piece, bar, shown[i - 1], 14 + i * staveWidth, staveWidth - 10, active)
    })
  }, [piece, cursorTime, activeIds, fromBeat])

  return <div className="score-host" ref={hostRef} />
}

function drawMeasure(
  ctx: InstanceType<typeof Renderer>['getContext'] extends () => infer T ? T : never,
  piece: Piece,
  bar: ScoreBar,
  previous: ScoreBar | undefined,
  x: number,
  staveWidth: number,
  active: Set<string>
): void {
  const upperNotes = piece.notes.filter((note) => (note.staff ?? (noteHand(note) === 'right' ? 1 : 2)) === 1)
  const lowerNotes = piece.notes.filter((note) => (note.staff ?? (noteHand(note) === 'right' ? 1 : 2)) === 2)
  const upperClef = staffClef(upperNotes, 1)
  const lowerClef = staffClef(lowerNotes, 2)
  const treble = new Stave(x, 18, staveWidth)
  const bass = new Stave(x, 168, staveWidth)
  const signatureChanged = !previous || previous.signature.join('/') !== bar.signature.join('/')
  if (!previous) {
    treble.addClef(upperClef).addKeySignature(keyFromFifths(piece.keySignature)).addTimeSignature(`${bar.signature[0]}/${bar.signature[1]}`)
    bass.addClef(lowerClef).addKeySignature(keyFromFifths(piece.keySignature)).addTimeSignature(`${bar.signature[0]}/${bar.signature[1]}`)
  } else if (signatureChanged) {
    treble.addTimeSignature(`${bar.signature[0]}/${bar.signature[1]}`)
    bass.addTimeSignature(`${bar.signature[0]}/${bar.signature[1]}`)
  }
  treble.setContext(ctx).draw()
  bass.setContext(ctx).draw()
  new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw()
  new StaveConnector(treble, bass).setType('singleRight').setContext(ctx).draw()
  if (!previous) new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw()

  const beats = bar.end - bar.start
  drawStaff(ctx, treble, upperNotes, bar, beats, piece.keySignature, upperClef, 'b/4', active, staveWidth)
  drawStaff(ctx, bass, lowerNotes, bar, beats, piece.keySignature, lowerClef, 'd/3', active, staveWidth)
}

function drawStaff(
  ctx: InstanceType<typeof Renderer>['getContext'] extends () => infer T ? T : never,
  stave: Stave,
  notes: ScoreNote[],
  bar: ScoreBar,
  beats: number,
  keySignature: number,
  clef: Clef,
  restKey: string,
  active: Set<string>,
  staveWidth: number
): void {
  const inBar = notesInWindow(notes, bar.start, bar.end)
  const voiceIds = [...new Set(inBar.map((note) => note.voice ?? 1))].sort((a, b) => a - b)
  const groups = voiceIds.length ? voiceIds : [1]
  try {
    const built = groups.map((voice, index) => {
      const stemUp = index === 0
      const voiceNotes = inBar.filter((note) => (note.voice ?? 1) === voice)
      const ticks = fillTicks(voiceNotes, bar.start, beats, keySignature, restKey, stemUp)
      const staveNotes = toStaveNotes(ticks, clef, active)
      const vf = new Voice({ numBeats: bar.signature[0], beatValue: bar.signature[1] }).setStrict(false)
      vf.addTickables(staveNotes)
      return { vf, staveNotes }
    })
    const voices = built.map((item) => item.vf)
    const room = Math.max(80, (stave.getNoteEndX?.() ?? staveWidth) - (stave.getNoteStartX?.() ?? 40) - 12)
    new Formatter().joinVoices(voices).format(voices, Math.min(room, staveWidth - 24))
    for (const item of built) {
      item.vf.draw(ctx, stave)
      const beamable = item.staveNotes.filter((note) => {
        const duration = note.getDuration()
        return duration === '8' || duration === '16'
      })
      if (beamable.length > 1) {
        Beam.generateBeams(beamable).forEach((beam) => beam.setContext(ctx).draw())
      }
    }
  } catch {
    ctx.fillText('Такт не собрался', stave.getX() + 16, stave.getY() + 24)
  }
}

function keyFromFifths(fifths: number): string {
  const map: Record<number, string> = {
    [-7]: 'Cb',
    [-6]: 'Gb',
    [-5]: 'Db',
    [-4]: 'Ab',
    [-3]: 'Eb',
    [-2]: 'Bb',
    [-1]: 'F',
    0: 'C',
    1: 'G',
    2: 'D',
    3: 'A',
    4: 'E',
    5: 'B',
    6: 'F#',
    7: 'C#'
  }
  return map[fifths] ?? 'C'
}
