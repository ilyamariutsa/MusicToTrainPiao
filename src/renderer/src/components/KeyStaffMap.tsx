import { useEffect, useMemo, useRef, useState } from 'react'
import { Renderer, Stave, StaveConnector } from 'vexflow'
import {
  assertGrandStaffGeometry,
  BASS_BOTTOM,
  BASS_TOP,
  diatonicIndex,
  GLYPH,
  layoutStaff,
  LEDGER_EXTENSION,
  LINE_SNAP,
  MUSIC_EM,
  MUSIC_FONT,
  pyramidLedgers,
  SPACE,
  STAFF_GUTTER,
  TREBLE_BOTTOM,
  TREBLE_TOP
} from '../lib/grandStaff'
import { blackKeys, keyCenterPercent, whiteKeys } from '../lib/keyboardLayout'
import { midiToVexKey } from '../lib/theory'
import type { ScoreNote } from '../types'

/** C2 — начало большой октавы, B6 — конец 3-й. */
export const GUIDE_FROM_MIDI = 36
export const GUIDE_TO_MIDI = 95
export { STAFF_GUTTER }

const PIANO_LOW = 21
const PIANO_HIGH = 108

/** At least C2–B6, widened by whole octaves so every note of the piece has its key. */
export function guideRange(notes: Array<{ midi: number }>): [number, number] {
  if (notes.length === 0) return [GUIDE_FROM_MIDI, GUIDE_TO_MIDI]
  const midis = notes.map((note) => note.midi)
  const low = Math.floor(Math.min(...midis) / 12) * 12
  const high = Math.floor(Math.max(...midis) / 12) * 12 + 11
  return [Math.max(PIANO_LOW, Math.min(GUIDE_FROM_MIDI, low)), Math.min(PIANO_HIGH, Math.max(GUIDE_TO_MIDI, high))]
}

type Props = {
  fromMidi?: number
  toMidi?: number
  notes: ScoreNote[]
  keySignature?: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const INK = '#1c1612'
const HOT = '#c4784a'
const GUIDE = '#6a5340cc'
/** Notehead width as a share of a white key, so neighbours on the staircase never touch. */
const HEAD_OF_KEY = 0.7
/** Room for the clefs, left of the keyboard. */
const CLEF_X = 28

type Ink = { left: number; right: number; ascent: number; descent: number }

/**
 * Glyphs are measured by scanning their pixels at this size: measureText bounds are
 * padded (a whole note comes out 3.5% wider than it is), pixels are exact to 1/600 em.
 */
const REFERENCE_SIZE = 600
/** Ink boxes in em, relative to the glyph origin (alphabetic baseline, left side). */
const inkCache = new Map<string, Ink>()

function scanInk(char: string): Ink | null {
  const size = REFERENCE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size * 2
  canvas.height = size * 3
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const ox = size / 2
  const oy = size * 2
  ctx.font = `${size}px ${MUSIC_FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(char, ox, oy)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return {
    left: (minX - ox) / size,
    right: (maxX + 1 - ox) / size,
    ascent: (oy - minY) / size,
    descent: (maxY + 1 - oy) / size
  }
}

/** Ink box of a glyph at a font size, relative to where it is drawn. */
function inkBox(char: string, size: number): Ink {
  let em = inkCache.get(char)
  if (!em) {
    const fontReady = !document.fonts || document.fonts.check(`${REFERENCE_SIZE}px ${MUSIC_FONT}`)
    const scanned = fontReady ? scanInk(char) : null
    // Never remember metrics of a fallback font; a rough box keeps the drawing sane meanwhile.
    if (!scanned) return { left: 0, right: size * 0.42, ascent: size * 0.125, descent: size * 0.125 }
    em = scanned
    inkCache.set(char, em)
  }
  return { left: em.left * size, right: em.right * size, ascent: em.ascent * size, descent: em.descent * size }
}

type Placed = {
  x: number
  index: number
  on: boolean
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
    // contentRect is fractional and excludes the border — the same box the keys are laid out in.
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || width < 120) return
    let cancelled = false

    const draw = (): void => {
      if (cancelled || !hostRef.current) return
      host.innerHTML = ''

      const { height } = layout
      /** Every pitch, line and glyph is placed on this one grid. */
      const yLine = (index: number): number => layout.yOf(index) + LINE_SNAP

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
      // VexFlow only draws the brace and the system line; staff lines and glyphs are ours.
      const staveWidth = width - 28
      const treble = new Stave(20, yLine(TREBLE_TOP), staveWidth, staveOpts)
      const bass = new Stave(20, yLine(BASS_TOP), staveWidth, staveOpts)
      for (let line = 0; line < 5; line += 1) {
        treble.setConfigForLine(line, { visible: false })
        bass.setConfigForLine(line, { visible: false })
      }
      treble.setContext(ctx).draw()
      bass.setContext(ctx).draw()
      new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw()
      new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw()

      const svg = host.querySelector('svg')
      if (!svg) return
      const layer = document.createElementNS(SVG_NS, 'g')
      svg.appendChild(layer)

      const addLine = (x1: number, y1: number, x2: number, y2: number, attrs: Record<string, string>): void => {
        const line = document.createElementNS(SVG_NS, 'line')
        line.setAttribute('x1', String(x1))
        line.setAttribute('y1', String(y1))
        line.setAttribute('x2', String(x2))
        line.setAttribute('y2', String(y2))
        for (const [key, value] of Object.entries(attrs)) line.setAttribute(key, value)
        layer.appendChild(line)
      }

      /** Glyph with its origin on (x, y); the SVG default baseline is the SMuFL one. */
      const addGlyph = (char: string, x: number, y: number, size: number, fill: string): void => {
        const text = document.createElementNS(SVG_NS, 'text')
        text.setAttribute('x', String(x))
        text.setAttribute('y', String(y))
        text.setAttribute('font-family', MUSIC_FONT)
        text.setAttribute('font-size', String(size))
        text.setAttribute('fill', fill)
        text.textContent = char
        layer.appendChild(text)
      }

      /** Glyph centred on x horizontally (by its ink), origin on the pitch line. */
      const addCentred = (char: string, cx: number, y: number, size: number, fill: string): Ink => {
        const ink = inkBox(char, size)
        addGlyph(char, cx - (ink.left + ink.right) / 2, y, size, fill)
        return ink
      }

      const span = width - STAFF_GUTTER
      const xAt = (midi: number): number => STAFF_GUTTER + (keyCenterPercent(midi, fromMidi, toMidi) / 100) * span

      const whites = whiteKeys(fromMidi, toMidi)
      const whiteWidth = span / Math.max(1, whites.length)
      const fullHead = inkBox(GLYPH.noteheadWhole, MUSIC_EM)
      const headScale = Math.min(1, (whiteWidth * HEAD_OF_KEY) / (fullHead.right - fullHead.left))
      const headSize = MUSIC_EM * headScale
      const head = inkBox(GLYPH.noteheadWhole, headSize)
      // Accidentals fit into the gap between two neighbouring heads.
      const fullSharp = inkBox(GLYPH.sharp, MUSIC_EM)
      const gap = whiteWidth - (head.right - head.left)
      const accWidth = Math.max(4, Math.min(gap * 0.88, SPACE * 0.6))
      const accSize = MUSIC_EM * (accWidth / (fullSharp.right - fullSharp.left))

      const heads: Placed[] = whites.map((midi) => ({ x: xAt(midi), index: diatonicIndex(midi), on: active.has(midi) }))
      const marks: Array<Placed & { glyph: string }> = blackKeys(fromMidi, toMidi).map((midi) => {
        const flat = midiToVexKey(midi, keySignature).accidental === 'b'
        // A sharp shares the line of the lower letter (C♯ on C), a flat of the upper one (D♭ on D).
        return {
          x: xAt(midi),
          index: diatonicIndex(flat ? midi + 1 : midi - 1),
          on: active.has(midi),
          glyph: flat ? GLYPH.flat : GLYPH.sharp
        }
      })

      // Guides from each key down to the top of its glyph.
      for (const item of heads) {
        addLine(item.x, 0, item.x, yLine(item.index) - head.ascent, {
          stroke: item.on ? HOT : GUIDE,
          'stroke-width': item.on ? '2.8' : '1.5',
          'stroke-linecap': 'butt'
        })
      }
      for (const item of marks) {
        addLine(item.x, 0, item.x, yLine(item.index) - inkBox(item.glyph, accSize).ascent, {
          stroke: item.on ? HOT : GUIDE,
          'stroke-width': item.on ? '2.8' : '1.5',
          'stroke-linecap': 'butt',
          'stroke-dasharray': item.on ? '6 4' : '4 3.5'
        })
      }

      const staffLeft = 20
      const staffRight = width - 8
      for (const index of [TREBLE_TOP, 36, 34, 32, TREBLE_BOTTOM, BASS_TOP, 24, 22, 20, BASS_BOTTOM]) {
        addLine(staffLeft, yLine(index), staffRight, yLine(index), { stroke: INK, 'stroke-width': '1.2' })
      }
      const ledgerPad = (head.right - head.left) / 2 + LEDGER_EXTENSION * SPACE * headScale
      for (const ledger of pyramidLedgers([...heads, ...marks], ledgerPad)) {
        addLine(ledger.left, yLine(ledger.index), ledger.right, yLine(ledger.index), { stroke: INK, 'stroke-width': '1.45' })
      }

      // Clefs at full staff size: G clef curls round G4, F clef dots around F3.
      addGlyph(GLYPH.gClef, CLEF_X, yLine(32), MUSIC_EM, INK)
      addGlyph(GLYPH.fClef, CLEF_X, yLine(24), MUSIC_EM, INK)

      for (const item of heads) addCentred(GLYPH.noteheadWhole, item.x, yLine(item.index), headSize, item.on ? HOT : INK)
      for (const item of marks) addCentred(item.glyph, item.x, yLine(item.index), accSize, item.on ? HOT : INK)
    }

    const ready = document.fonts ? document.fonts.load(`${MUSIC_EM}px ${MUSIC_FONT}`).then(() => undefined) : Promise.resolve()
    void ready.then(draw, draw)
    return () => {
      cancelled = true
    }
  }, [width, layout, fromMidi, toMidi, active, keySignature])

  return <div className="key-staff-map" ref={hostRef} style={{ height: layout.height }} aria-hidden="true" />
}
