import { useEffect, useRef } from 'react'
import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow'
import { beatsPerMeasure, beatsToVexDuration, midiToVexKey, notesInWindow } from '../lib/theory'
import type { Piece, ScoreNote } from '../types'

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
}

function fillTicks(notes: ScoreNote[], start: number, beats: number, keySignature: number, restKey: string): Tick[] {
  const inBar = notesInWindow(notes, start, start + beats).sort((a, b) => a.time - b.time)
  const ticks: Tick[] = []
  let cursor = start
  const groups = new Map<number, ScoreNote[]>()
  for (const note of inBar) {
    const bucket = groups.get(note.time) ?? []
    bucket.push(note)
    groups.set(note.time, bucket)
  }
  const times = [...groups.keys()].sort((a, b) => a - b)

  const pushRest = (dur: number): void => {
    if (dur <= 0.05) return
    const vex = beatsToVexDuration(dur)
    ticks.push({
      keys: [restKey],
      accidentals: [undefined],
      duration: `${vex.duration}r`,
      dotted: vex.dotted,
      rest: true,
      ids: []
    })
  }

  for (const time of times) {
    const gap = time - cursor
    if (gap > 0.08) pushRest(gap)
    const chord = groups.get(time)!
    const dur = Math.min(chord[0].duration, start + beats - time)
    const vex = beatsToVexDuration(dur)
    ticks.push({
      keys: chord.map((n) => midiToVexKey(n.midi, keySignature).key),
      accidentals: chord.map((n) => midiToVexKey(n.midi, keySignature).accidental),
      duration: vex.duration,
      dotted: vex.dotted,
      rest: false,
      ids: chord.map((n) => n.id)
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
      ids: []
    })
  }
  return ticks
}

function toStaveNotes(ticks: Tick[], clef: string, activeIds: Set<string>): StaveNote[] {
  return ticks.map((tick) => {
    const note = new StaveNote({
      clef,
      keys: tick.keys,
      duration: tick.duration,
      autoStem: true
    })
    tick.accidentals.forEach((acc, idx) => {
      if (acc) note.addModifier(new Accidental(acc), idx)
    })
    if (tick.dotted) Dot.buildAndAttach([note], { all: true })
    if (tick.ids.some((id) => activeIds.has(id))) {
      note.setStyle({ fillStyle: '#c4784a', strokeStyle: '#c4784a' })
    } else {
      note.setStyle({ fillStyle: '#2a2118', strokeStyle: '#2a2118' })
    }
    return note
  })
}

export function ScoreView({ piece, cursorTime, activeIds = [], fromBeat }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''

    const measureBeats = beatsPerMeasure(piece.timeSignature)
    const startPoint = fromBeat ?? Math.max(0, Math.floor(cursorTime / measureBeats) * measureBeats)
    const measures = 2
    const width = Math.max(640, host.clientWidth || 860)
    const height = 280
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(width, height)
    const ctx = renderer.getContext()
    ctx.setFont('Georgia', 14)

    const active = new Set(activeIds)
    const staveWidth = (width - 36) / measures

    for (let i = 0; i < measures; i += 1) {
      const mStart = startPoint + i * measureBeats
      const x = 18 + i * staveWidth
      const treble = new Stave(x, 16, staveWidth - 8)
      const bass = new Stave(x, 140, staveWidth - 8)
      if (i === 0) {
        treble.addClef('treble').addTimeSignature(`${piece.timeSignature[0]}/${piece.timeSignature[1]}`)
        bass.addClef('bass').addTimeSignature(`${piece.timeSignature[0]}/${piece.timeSignature[1]}`)
        if (piece.keySignature) {
          const keyName = keyFromFifths(piece.keySignature)
          treble.addKeySignature(keyName)
          bass.addKeySignature(keyName)
        }
      }
      treble.setContext(ctx).draw()
      bass.setContext(ctx).draw()
      new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw()
      new StaveConnector(treble, bass).setType('singleRight').setContext(ctx).draw()
      if (i === 0) new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw()

      const rh = piece.notes.filter((n) => n.clef === 'treble')
      const lh = piece.notes.filter((n) => n.clef === 'bass')
      const rhNotes = toStaveNotes(fillTicks(rh, mStart, measureBeats, piece.keySignature, 'b/4'), 'treble', active)
      const lhNotes = toStaveNotes(fillTicks(lh, mStart, measureBeats, piece.keySignature, 'd/3'), 'bass', active)

      try {
        const rhVoice = new Voice({ numBeats: piece.timeSignature[0], beatValue: piece.timeSignature[1] }).setStrict(false)
        const lhVoice = new Voice({ numBeats: piece.timeSignature[0], beatValue: piece.timeSignature[1] }).setStrict(false)
        rhVoice.addTickables(rhNotes)
        lhVoice.addTickables(lhNotes)
        new Formatter().joinVoices([rhVoice]).format([rhVoice], staveWidth - 90)
        new Formatter().joinVoices([lhVoice]).format([lhVoice], staveWidth - 90)
        rhVoice.draw(ctx, treble)
        lhVoice.draw(ctx, bass)
        Beam.generateBeams(rhNotes.filter((n) => n.getDuration() === '8' || n.getDuration() === '16')).forEach((b) =>
          b.setContext(ctx).draw()
        )
        Beam.generateBeams(lhNotes.filter((n) => n.getDuration() === '8' || n.getDuration() === '16')).forEach((b) =>
          b.setContext(ctx).draw()
        )
      } catch {
        ctx.fillText('Не удалось отрисовать такт — проверьте длительности импорта', x + 12, 80)
      }
    }
  }, [piece, cursorTime, activeIds, fromBeat])

  return <div className="score-host" ref={hostRef} />
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
