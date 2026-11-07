import { useEffect, useMemo, useRef, useState } from 'react'
import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Voice } from 'vexflow'
import {
  barAccidentals,
  measureContaining,
  midiToVexKey,
  noteHand,
  notesInWindow,
  pieceBars,
  roundBeat,
  tiePredecessors,
  type Accidental as AccidentalSign
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

type Ctx = InstanceType<typeof Renderer>['getContext'] extends () => infer T ? T : never

/** Drawable lengths, longest first: [beats, VexFlow duration, dotted]. */
const DRAWABLE: Array<[number, string, boolean]> = [
  [4, 'w', false],
  [3, 'h', true],
  [2, 'h', false],
  [1.5, 'q', true],
  [1, 'q', false],
  [0.75, '8', true],
  [0.5, '8', false],
  [0.375, '16', true],
  [0.25, '16', false],
  [0.125, '32', false]
]

/** A length as drawable pieces (2.5 beats = half + eighth); leftovers under a 32nd are dropped. */
function decompose(beats: number): Array<[number, string, boolean]> {
  const parts: Array<[number, string, boolean]> = []
  let left = beats
  while (left > 0.1) {
    const part = DRAWABLE.find(([len]) => len <= left + 0.01)
    if (!part) break
    parts.push(part)
    left = roundBeat(left - part[0])
  }
  return parts.length ? parts : [DRAWABLE[DRAWABLE.length - 1]]
}

const staffOf = (note: ScoreNote): 1 | 2 => note.staff ?? (noteHand(note) === 'right' ? 1 : 2)

/** Notes as drawn: a note that runs over a bar line goes on as a tied note in the next bar. */
function splitAtBars(notes: ScoreNote[], bars: ScoreBar[]): ScoreNote[] {
  const out: ScoreNote[] = []
  for (const note of notes) {
    let start = note.time
    let left = note.duration
    for (let part = 0; left > 0.02 && part < 64; part += 1) {
      const bar = bars.find((b) => start >= b.start - 0.001 && start < b.end - 0.001)
      const room = bar ? roundBeat(bar.end - start) : left
      const length = left <= room + 0.02 ? left : room
      out.push(
        part === 0
          ? length === note.duration
            ? note
            : { ...note, duration: roundBeat(length) }
          : { ...note, id: `${note.id}~${part}`, time: roundBeat(start), duration: roundBeat(length), tied: true }
      )
      start = roundBeat(start + length)
      left = roundBeat(left - length)
    }
  }
  return out
}

type Tick = {
  keys: string[]
  accidentals: Array<AccidentalSign | undefined>
  duration: string
  dotted: boolean
  rest: boolean
  ids: string[]
  /** This tick continues the previous one (a long note drawn in two pieces). */
  tiedToPrevious: boolean
}

function fillTicks(
  notes: ScoreNote[],
  start: number,
  beats: number,
  keySignature: number,
  signs: Map<string, AccidentalSign | undefined>,
  restKey: string
): Tick[] {
  const end = start + beats
  const groups = new Map<number, ScoreNote[]>()
  for (const note of notesInWindow(notes, start, end)) {
    const key = roundBeat(note.time)
    groups.set(key, [...(groups.get(key) ?? []), note])
  }
  const times = [...groups.keys()].sort((a, b) => a - b)
  const ticks: Tick[] = []
  let cursor = start

  const pushRests = (length: number): void => {
    for (const [, duration, dotted] of decompose(length)) {
      ticks.push({ keys: [restKey], accidentals: [undefined], duration: `${duration}r`, dotted, rest: true, ids: [], tiedToPrevious: false })
    }
  }

  times.forEach((time, i) => {
    if (time - cursor > 0.03) pushRests(time - cursor)
    const chord = [...new Map(groups.get(time)!.map((note) => [note.midi, note])).values()].sort((a, b) => a.midi - b.midi)
    // A note is drawn up to the next onset in its voice, so a bar never overflows.
    const next = times[i + 1] ?? end
    const length = Math.max(0.125, Math.min(...chord.map((note) => note.duration), next - time, end - time))
    const keys = chord.map((note) => midiToVexKey(note.midi, keySignature, note).key)
    decompose(length).forEach(([, duration, dotted], piece) => {
      ticks.push({
        keys,
        accidentals: piece === 0 ? chord.map((note) => signs.get(note.id)) : chord.map(() => undefined),
        duration,
        dotted,
        rest: false,
        ids: piece === 0 ? chord.map((note) => note.id) : [],
        tiedToPrevious: piece > 0
      })
    })
    cursor = time + length
  })
  if (end - cursor > 0.03) pushRests(end - cursor)
  if (ticks.length === 0) {
    // An empty bar: one whole-bar rest, whatever the meter.
    ticks.push({ keys: [restKey], accidentals: [undefined], duration: 'wr', dotted: false, rest: true, ids: [], tiedToPrevious: false })
  }
  return ticks
}

function toStaveNotes(ticks: Tick[], clef: Clef, stemUp: boolean, activeIds: Set<string>, drawn: Drawn): StaveNote[] {
  return ticks.map((tick) => {
    const note = new StaveNote({ clef, keys: tick.keys, duration: tick.duration, autoStem: tick.rest })
    tick.ids.forEach((id, index) => drawn.set(id, { note, index }))
    if (!tick.rest) note.setStemDirection(stemUp ? 1 : -1)
    tick.accidentals.forEach((acc, idx) => {
      if (acc) note.addModifier(new Accidental(acc), idx)
    })
    if (tick.dotted) Dot.buildAndAttach([note], { all: true })
    const color = tick.ids.some((id) => activeIds.has(id)) ? '#8a5a2b' : '#1b1814'
    note.setStyle({ fillStyle: color, strokeStyle: color })
    return note
  })
}

function staffClef(notes: ScoreNote[], staff: 1 | 2): Clef {
  const own = notes.find((note) => staffOf(note) === staff)
  if (own) return own.clef
  return staff === 1 ? 'treble' : 'bass'
}

export function ScoreView({ piece, cursorTime, activeIds = [], fromBeat }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [hostWidth, setHostWidth] = useState(0)
  const bars = useMemo(() => pieceBars(piece), [piece])
  const notes = useMemo(() => splitAtBars(piece.notes, bars), [piece.notes, bars])

  // Redraw when the window (and so the score panel) changes width.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    setHostWidth(Math.round(host.getBoundingClientRect().width))
    const ro = new ResizeObserver(([entry]) => setHostWidth(Math.round(entry.contentRect.width)))
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || hostWidth === 0) return
    host.innerHTML = ''

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

    const width = Math.max(640, hostWidth)
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(width, 320)
    const ctx = renderer.getContext()
    ctx.setFont('Palatino Linotype', 13)

    const active = new Set(activeIds)
    const drawn: Drawn = new Map()
    const upper = notes.filter((note) => staffOf(note) === 1)
    const lower = notes.filter((note) => staffOf(note) === 2)
    const clefs: [Clef, Clef] = [staffClef(upper, 1), staffClef(lower, 2)]
    // Width follows the music in the bar; the first one also carries clef, key and time.
    const weights = shown.map((bar, i) => bar.end - bar.start + 1 + (i === 0 ? 1.5 : 0))
    const unit = (width - 28) / weights.reduce((sum, w) => sum + w, 0)
    let x = 14
    shown.forEach((bar, i) => {
      const staveWidth = weights[i] * unit
      drawMeasure(ctx, piece, bar, shown[i - 1], x, staveWidth - 10, [upper, lower], clefs, active, drawn)
      x += staveWidth
    })
    drawTies(ctx, notes, drawn)
  }, [piece, bars, notes, cursorTime, activeIds, fromBeat, hostWidth])

  return <div className="score-host" ref={hostRef} />
}

const SCREEN_BEATS = 8.5

/** Tie arcs between drawn notes; a tie into or out of the shown bars is drawn up to the edge. */
function drawTies(ctx: Ctx, notes: ScoreNote[], drawn: Drawn): void {
  const byId = new Map(notes.map((note) => [note.id, note]))
  for (const [id, before] of tiePredecessors(notes)) {
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
  staves: [ScoreNote[], ScoreNote[]],
  clefs: [Clef, Clef],
  active: Set<string>,
  drawn: Drawn
): void {
  const key = bar.key ?? piece.keySignature
  const previousKey = previous ? previous.key ?? piece.keySignature : null
  const treble = new Stave(x, 18, staveWidth)
  const bass = new Stave(x, 168, staveWidth)
  const time = `${bar.signature[0]}/${bar.signature[1]}`
  for (const [stave, clef] of [
    [treble, clefs[0]],
    [bass, clefs[1]]
  ] as const) {
    if (!previous) stave.addClef(clef).addKeySignature(keyFromFifths(key)).addTimeSignature(time)
    else {
      if (previousKey !== key) stave.addKeySignature(keyFromFifths(key), keyFromFifths(previousKey ?? 0))
      if (previous.signature.join('/') !== bar.signature.join('/')) stave.addTimeSignature(time)
    }
    stave.setContext(ctx).draw()
  }
  new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw()
  new StaveConnector(treble, bass).setType('singleRight').setContext(ctx).draw()
  if (!previous) new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw()

  drawStaff(ctx, treble, staves[0], bar, key, clefs[0], 'b/4', active, staveWidth, drawn)
  drawStaff(ctx, bass, staves[1], bar, key, clefs[1], 'd/3', active, staveWidth, drawn)
}

function drawStaff(
  ctx: Ctx,
  stave: Stave,
  notes: ScoreNote[],
  bar: ScoreBar,
  key: number,
  clef: Clef,
  restKey: string,
  active: Set<string>,
  staveWidth: number,
  drawn: Drawn
): void {
  const inBar = notesInWindow(notes, bar.start, bar.end)
  // Accidentals hold for the rest of the bar on this staff, across voices.
  const signs = barAccidentals(inBar, key)
  const voiceIds = [...new Set(inBar.map((note) => note.voice ?? 1))].sort((a, b) => a - b)
  const groups = voiceIds.length ? voiceIds : [1]
  try {
    const built = groups.map((voice, index) => {
      const ticks = fillTicks(
        inBar.filter((note) => (note.voice ?? 1) === voice),
        bar.start,
        bar.end - bar.start,
        key,
        signs,
        restKey
      )
      const staveNotes = toStaveNotes(ticks, clef, index === 0, active, drawn)
      const vf = new Voice({ numBeats: bar.signature[0], beatValue: bar.signature[1] }).setStrict(false)
      vf.addTickables(staveNotes)
      // Beams are made before drawing, so beamed notes lose their flags and share stems;
      // they follow the beats of the meter (2+2+2 eighths in 3/4, 3+3 in 6/8).
      const beams = Beam.generateBeams(staveNotes, {
        groups: Beam.getDefaultBeamGroups(`${bar.signature[0]}/${bar.signature[1]}`),
        maintainStemDirections: true
      })
      return { vf, staveNotes, ticks, beams }
    })
    const voices = built.map((item) => item.vf)
    const room = Math.max(80, (stave.getNoteEndX?.() ?? staveWidth) - (stave.getNoteStartX?.() ?? 40) - 12)
    new Formatter().joinVoices(voices).format(voices, Math.min(room, staveWidth - 24))
    for (const item of built) {
      item.vf.draw(ctx, stave)
      item.beams.forEach((beam) => beam.setContext(ctx).draw())
      // A long note drawn in two pieces inside the bar is tied together.
      item.ticks.forEach((tick, i) => {
        if (!tick.tiedToPrevious || i === 0) return
        const indexes = tick.keys.map((_, k) => k)
        new StaveTie({
          firstNote: item.staveNotes[i - 1],
          lastNote: item.staveNotes[i],
          firstIndexes: indexes,
          lastIndexes: indexes
        })
          .setContext(ctx)
          .draw()
      })
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
