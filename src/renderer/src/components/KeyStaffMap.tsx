import { useEffect, useMemo, useRef, useState } from 'react'
import { Renderer, Stave, StaveConnector } from 'vexflow'
import {
  assertGrandStaffGeometry,
  BASS_BOTTOM,
  BASS_TOP,
  diatonicIndex,
  layoutStaff,
  LINE_SNAP,
  NOTE_LIFT,
  pyramidLedgers,
  SPACE,
  STAFF_GUTTER,
  TREBLE_BOTTOM,
  TREBLE_TOP
} from '../lib/grandStaff'
import { blackKeys, keyCenterPercent, whiteKeys } from '../lib/keyboardLayout'
import { fitWholeNote, MUSIC_FONT, WHOLE_NOTE } from '../lib/musicGlyph'
import { midiToVexKey } from '../lib/theory'
import type { ScoreNote } from '../types'

/** C2 — начало большой октавы, B6 — конец 3-й. */
export const GUIDE_FROM_MIDI = 36
export const GUIDE_TO_MIDI = 95
export { STAFF_GUTTER }

type Props = {
  fromMidi?: number
  toMidi?: number
  notes: ScoreNote[]
  keySignature?: number
}

type Head = {
  x: number
  y: number
  index: number
  on: boolean
}

type Mark = {
  x: number
  y: number
  index: number
  on: boolean
  mark: '#' | 'b'
}

export function KeyStaffMap({
  fromMidi = GUIDE_FROM_MIDI,
  toMidi = GUIDE_TO_MIDI,
  notes,
  keySignature = 0
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const layout = useMemo(() => layoutStaff(fromMidi, toMidi), [fromMidi, toMidi])
  const active = useMemo(() => new Set(notes.map((note) => note.midi)), [notes])

  useEffect(() => {
    assertGrandStaffGeometry(layout)
  }, [layout])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const ro = new ResizeObserver(() => setWidth(host.clientWidth))
    ro.observe(host)
    setWidth(host.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || width < 120) return
    let cancelled = false

    const draw = (): void => {
      if (cancelled || !hostRef.current) return
      host.innerHTML = ''

      const { height, trebleTopY, bassTopY } = layout
      const renderer = new Renderer(host, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const ctx = renderer.getContext()
      const staveOpts = {
        spacingBetweenLinesPx: SPACE,
        spaceAboveStaffLn: 0,
        spaceBelowStaffLn: 0,
        leftBar: false,
        rightBar: false
      }
      const staveWidth = width - 28
      const treble = new Stave(20, trebleTopY, staveWidth, staveOpts)
      const bass = new Stave(20, bassTopY, staveWidth, staveOpts)
      for (let line = 0; line < 5; line += 1) {
        treble.setConfigForLine(line, { visible: false })
        bass.setConfigForLine(line, { visible: false })
      }
      treble.addClef('treble').setContext(ctx).draw()
      bass.addClef('bass').setContext(ctx).draw()
      new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw()
      new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw()
      const yPitch = (index: number): number => treble.getYForLine((TREBLE_TOP - index) / 2) + LINE_SNAP
      const yNote = (index: number): number => yPitch(index) - NOTE_LIFT

      const svg = host.querySelector('svg')
      if (!svg) return
      const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      svg.appendChild(layer)

      const addLine = (x1: number, y1: number, x2: number, y2: number, attrs: Record<string, string>): void => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', String(x1))
        line.setAttribute('y1', String(y1))
        line.setAttribute('x2', String(x2))
        line.setAttribute('y2', String(y2))
        for (const [key, value] of Object.entries(attrs)) line.setAttribute(key, value)
        layer.appendChild(line)
      }

      const span = width - STAFF_GUTTER
      const xAt = (midi: number): number => STAFF_GUTTER + (keyCenterPercent(midi, fromMidi, toMidi) / 100) * span
      const glyph = fitWholeNote(SPACE * 0.88)

      const heads: Head[] = whiteKeys(fromMidi, toMidi).map((midi) => {
        const index = diatonicIndex(midi)
        return { x: xAt(midi), y: yNote(index), index, on: active.has(midi) }
      })

      const marks: Mark[] = blackKeys(fromMidi, toMidi).map((midi) => {
        const spelled = midiToVexKey(midi, keySignature)
        const mark: '#' | 'b' = spelled.accidental === 'b' ? 'b' : '#'
        const letterMidi = mark === 'b' ? midi + 1 : midi - 1
        const index = diatonicIndex(letterMidi)
        return {
          x: xAt(midi),
          y: yNote(index),
          on: active.has(midi),
          mark,
          index
        }
      })

      for (const head of heads) {
        addLine(head.x, 0, head.x, head.y, {
          stroke: head.on ? '#c4784a' : '#6a5340cc',
          'stroke-width': head.on ? '2.8' : '1.5',
          'stroke-linecap': 'round'
        })
      }

      for (const mark of marks) {
        addLine(mark.x, 0, mark.x, mark.y, {
          stroke: mark.on ? '#c4784a' : '#6a5340cc',
          'stroke-width': mark.on ? '2.8' : '1.5',
          'stroke-linecap': 'round',
          'stroke-dasharray': mark.on ? '6 4' : '4 3.5'
        })
      }

      const staffLeft = 20
      const staffRight = width - 8
      for (const index of [TREBLE_TOP, 36, 34, 32, TREBLE_BOTTOM, BASS_TOP, 24, 22, 20, BASS_BOTTOM]) {
        addLine(staffLeft, yPitch(index), staffRight, yPitch(index), {
          stroke: '#1c1612',
          'stroke-width': '1.2'
        })
      }
      for (const span of pyramidLedgers([...heads, ...marks])) {
        addLine(span.left, yNote(span.index), span.right, yNote(span.index), {
          stroke: '#1c1612',
          'stroke-width': '1.45'
        })
      }

      for (const head of heads) {
        const note = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        note.setAttribute('x', String(head.x - glyph.dx))
        note.setAttribute('y', String(head.y - glyph.dy))
        note.setAttribute('text-anchor', 'middle')
        note.setAttribute('dominant-baseline', 'central')
        note.setAttribute('font-size', String(glyph.size))
        note.setAttribute('font-family', MUSIC_FONT)
        note.setAttribute('fill', head.on ? '#c4784a' : '#1c1612')
        note.textContent = WHOLE_NOTE
        layer.appendChild(note)
      }

      for (const mark of marks) {
        const acc = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        acc.setAttribute('x', String(mark.x))
        acc.setAttribute('y', String(mark.y))
        acc.setAttribute('text-anchor', 'middle')
        acc.setAttribute('dominant-baseline', 'central')
        acc.setAttribute('font-size', '15')
        acc.setAttribute('font-family', 'Georgia, "Times New Roman", serif')
        acc.setAttribute('fill', mark.on ? '#c4784a' : '#1c1612')
        acc.textContent = mark.mark === '#' ? '♯' : '♭'
        layer.appendChild(acc)
      }
    }

    const ready = document.fonts
      ? document.fonts.load(`48px ${MUSIC_FONT}`).then(() => document.fonts.ready)
      : Promise.resolve()
    void ready.then(draw, draw)
    return () => {
      cancelled = true
    }
  }, [width, layout, fromMidi, toMidi, active, keySignature])

  return <div className="key-staff-map" ref={hostRef} style={{ height: layout.height }} aria-hidden="true" />
}
