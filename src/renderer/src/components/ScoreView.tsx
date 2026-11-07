import { useEffect, useRef } from 'react'
import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Voice } from 'vexflow'
import {
  beatsToVexDuration,
  displayAccidental,
  measureContaining,
  midiToVexKey,
  noteHand,
  notesInWindow,
  pieceBars,
  roundBeat,
  tiePredecessors
} from '../lib/theory'
import type { Clef, Piece, ScoreBar, ScoreNote } from '../types'

/** Where each drawn note id ended up: its chord and the key index inside it. */
type Drawn = Map<string, { note: StaveNote; index: number }>

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

function toStaveNotes(ticks: Tick[], clef: Clef, activeIds: Set<string>, drawn: Drawn): StaveNote[] {
  return ticks.map((tick) => {
    const note = new StaveNote({
      clef,
      keys: tick.keys,
      duration: tick.duration,
      autoStem: tick.rest
    })
    tick.ids.forEach((id, index) => drawn.set(id, { note, index }))
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
    // About two bars of 4/4 per screen; bars of any real length (irregular ones too) fit by their size.
    const shown: ScoreBar[] = []
    let beatsShown = 0
    for (const bar of bars.slice(index)) {
      const length = bar.end - bar.start
      if (shown.length > 0 && (shown.length >= 4 || beatsShown + length > SCREEN_BEATS)) break
      shown.push(bar)
      beatsShown += length
    }
    if (shown.length === 0) return

    const width = Math.max(640, host.clientWidth || 860)
    const height = 320
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(width, height)
    const ctx = renderer.getContext()
    ctx.setFont('Palatino Linotype', 13)

    const active = new Set(activeIds)
    const drawn: Drawn = new Map()
    // Width follows the music in the bar; the first one also carries clef, key and time.
    const weights = shown.map((bar, i) => bar.end - bar.start + 1 + (i === 0 ? 1.5 : 0))
    const unit = (width - 28) / weights.reduce((sum, w) => sum + w, 0)
    let x = 14
    shown.forEach((bar, i) => {
      const staveWidth = weights[i] * unit
      drawMeasure(ctx, piece, bar, shown[i - 1], x, staveWidth - 10, active, drawn)
      x += staveWidth
    })
    drawTies(ctx, piece, drawn)
  }, [piece, cursorTime, activeIds, fromBeat])

  return <div className="score-host" ref={hostRef} />
}

const SCREEN_BEATS = 8.5

type Ctx = InstanceType<typeof Renderer>['getContext'] extends () => infer T ? T : never

/** Tie arcs between drawn notes; a tie into or out of the shown bars is drawn up to the edge. */
function drawTies(ctx: Ctx, piece: Piece, drawn: Drawn): void {
  const staffOf = (note: ScoreNote): number => note.staff ?? (noteHand(note) === 'right' ? 1 : 2)
  const byId = new Map(piece.notes.map((note) => [note.id, note]))
  for (const [id, before] of tiePredecessors(piece.notes)) {
    const note = byId.get(id)
    if (!note || staffOf(note) !== staffOf(before)) continue
    const last = drawn.get(id)
    const first = drawn.get(before.id)
    if (!first && !last) continue
    try {
      new StaveTie({
        firstNote: first?.note ?? null,
        lastNote: last?.note ?? null,
        firstIndexes: [(first ?? last)!.index],
        lastIndexes: [(last ?? first)!.index]
      })
        .setContext(ctx)
        .draw()
    } catch {
      /* a tie VexFlow cannot place is skipped, the notes stay */
    }
  }
}

function drawMeasure(
  ctx: Ctx,
  piece: Piece,
  bar: ScoreBar,
  previous: ScoreBar | undefined,
  x: number,
  staveWidth: number,
  active: Set<string>,
  drawn: Drawn
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
  drawStaff(ctx, treble, upperNotes, bar, beats, piece.keySignature, upperClef, 'b/4', active, staveWidth, drawn)
  drawStaff(ctx, bass, lowerNotes, bar, beats, piece.keySignature, lowerClef, 'd/3', active, staveWidth, drawn)
}

function drawStaff(
  ctx: Ctx,
  stave: Stave,
  notes: ScoreNote[],
  bar: ScoreBar,
  beats: number,
  keySignature: number,
  clef: Clef,
  restKey: string,
  active: Set<string>,
  staveWidth: number,
  drawn: Drawn
): void {
  const inBar = notesInWindow(notes, bar.start, bar.end)
  const voiceIds = [...new Set(inBar.map((note) => note.voice ?? 1))].sort((a, b) => a - b)
  const groups = voiceIds.length ? voiceIds : [1]
  try {
    const built = groups.map((voice, index) => {
      const stemUp = index === 0
      const voiceNotes = inBar.filter((note) => (note.voice ?? 1) === voice)
      const ticks = fillTicks(voiceNotes, bar.start, beats, keySignature, restKey, stemUp)
      const staveNotes = toStaveNotes(ticks, clef, active, drawn)
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
