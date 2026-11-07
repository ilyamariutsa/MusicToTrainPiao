import { useMemo, useRef } from 'react'
import { blackKeys, whiteKeys } from '../lib/keyboardLayout'
import { midiToRu, octaveRu } from '../lib/theory'
import type { Finger, ScoreNote } from '../types'
import { GUIDE_FROM_MIDI, GUIDE_TO_MIDI, KeyStaffMap, STAFF_GUTTER } from './KeyStaffMap'

type Props = {
  fromMidi?: number
  toMidi?: number
  activeMidis?: number[]
  expectedMidis?: number[]
  fingers?: Partial<Record<number, Finger>>
  wrongMidis?: number[]
  holdMs?: Partial<Record<number, number>>
  showNames?: boolean
  guideNotes?: ScoreNote[]
  /** Keys shown with the staff guide; defaults to C2–B6. */
  guideRange?: [number, number]
  keySignature?: number
  /** The "range · N keys" line above the keys. */
  legend?: boolean
  onNote?: (midi: number) => void
}

export function PianoKeyboard({
  fromMidi = 28,
  toMidi = 103,
  activeMidis = [],
  expectedMidis = [],
  fingers = {},
  wrongMidis = [],
  holdMs = {},
  showNames = true,
  guideNotes,
  guideRange = [GUIDE_FROM_MIDI, GUIDE_TO_MIDI],
  keySignature = 0,
  legend = true,
  onNote
}: Props) {
  const viewFrom = guideNotes ? guideRange[0] : fromMidi
  const viewTo = guideNotes ? guideRange[1] : toMidi
  const whites = useMemo(() => whiteKeys(viewFrom, viewTo), [viewFrom, viewTo])
  const blacks = useMemo(() => blackKeys(viewFrom, viewTo), [viewFrom, viewTo])

  const total = viewTo - viewFrom + 1
  const whiteWidth = 100 / whites.length
  const blackWidth = whiteWidth * 0.58
  // A new hold map (even for the same key and length) remounts the bars, so the
  // shrinking animation starts over for a repeated note.
  const holdRun = useRef({ map: holdMs, n: 0 })
  if (holdRun.current.map !== holdMs) holdRun.current = { map: holdMs, n: holdRun.current.n + 1 }
  const holdKey = holdRun.current.n

  return (
    <div className="piano-block">
      {guideNotes || !legend ? null : (
        <div className="piano-legend">
          <span>
            {midiToRu(fromMidi)} → {midiToRu(toMidi)}
          </span>
          <strong>
            {total} клавиш · {whites.length} белых · {blacks.length} чёрных
          </strong>
        </div>
      )}
      <div
        className="piano"
        role="application"
        aria-label="Клавиатура пианино"
        style={guideNotes ? { marginLeft: STAFF_GUTTER, width: `calc(100% - ${STAFF_GUTTER}px)` } : undefined}
      >
        {whites.map((midi, index) => {
          const state = keyState(midi, activeMidis, expectedMidis, wrongMidis)
          const isC = midi % 12 === 0
          const stripe = Math.floor(midi / 12) % 2 === 0 ? 'oct-a' : 'oct-b'
          return (
            <button
              key={midi}
              type="button"
              className={`piano-key white ${state} ${stripe} ${midi === 60 ? 'middle-c' : ''} ${isC ? 'octave-start' : ''}`}
              style={{
                left: `${index * whiteWidth}%`,
                width: `${whiteWidth}%`,
                ['--hold-ms' as string]: `${holdMs[midi] ?? 0}ms`
              }}
              onMouseDown={() => onNote?.(midi)}
              title={`${midiToRu(midi)} · ${octaveRu(midi)} октава`}
            >
              {holdMs[midi] ? <span key={holdKey} className="hold-bar" /> : null}
              {fingers[midi] ? <span className="piano-finger">{fingers[midi]}</span> : null}
              {isC && showNames ? <span className="piano-c">До</span> : null}
            </button>
          )
        })}
        {blacks.map((midi) => {
          const leftWhite = whites.indexOf(midi - 1)
          if (leftWhite < 0) return null
          const left = (leftWhite + 1) * whiteWidth - blackWidth / 2
          const state = keyState(midi, activeMidis, expectedMidis, wrongMidis)
          return (
            <button
              key={midi}
              type="button"
              className={`piano-key black ${state}`}
              style={{
                left: `${left}%`,
                width: `${blackWidth}%`,
                ['--hold-ms' as string]: `${holdMs[midi] ?? 0}ms`
              }}
              onMouseDown={() => onNote?.(midi)}
              title={midiToRu(midi, keySignature)}
            >
              {holdMs[midi] ? <span key={holdKey} className="hold-bar" /> : null}
              {fingers[midi] ? <span className="piano-finger">{fingers[midi]}</span> : null}
            </button>
          )
        })}
      </div>
      {guideNotes ? (
        <KeyStaffMap fromMidi={viewFrom} toMidi={viewTo} notes={guideNotes} keySignature={keySignature} />
      ) : null}
      <div
        className="octave-rail"
        style={guideNotes ? { marginLeft: STAFF_GUTTER, width: `calc(100% - ${STAFF_GUTTER}px)` } : undefined}
      >
        {whites.map((midi, index) => {
          if (midi % 12 !== 0) return null
          const nextC = whites.findIndex((w, i) => i > index && w % 12 === 0)
          const span = (nextC === -1 ? whites.length : nextC) - index
          return (
            <span
              key={midi}
              className={midi === 60 ? 'oct-lab on' : 'oct-lab'}
              style={{
                left: `${(index / whites.length) * 100}%`,
                width: `${span * whiteWidth}%`
              }}
            >
              {octaveRu(midi)}
              {midi === 60 ? ' · до 1' : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function keyState(midi: number, active: number[], expected: number[], wrong: number[]): string {
  if (wrong.includes(midi)) return 'wrong'
  if (active.includes(midi)) return 'active'
  if (expected.includes(midi)) return 'expected'
  return ''
}
