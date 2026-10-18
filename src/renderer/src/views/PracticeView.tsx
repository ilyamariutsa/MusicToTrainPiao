import { useEffect, useMemo, useRef, useState } from 'react'
import { FingeringCoach } from '../components/FingeringCoach'
import { PianoKeyboard } from '../components/PianoKeyboard'
import { ScoreView } from '../components/ScoreView'
import { initAudio, playNote } from '../lib/audio'
import { midiFromKeyboardEvent } from '../lib/keyboardMap'
import { subscribeMidi } from '../lib/midiInput'
import { expectedMidis, firstEvent, ScorePlayer, stepEvent } from '../lib/player'
import { beatsToRu, KEY_NAMES, measureContaining, midiToRu, noteHand, phraseBounds } from '../lib/theory'
import { useLibrary } from '../store'
import { KEYBOARD_PRESETS, type Finger, type Hand, type Piece } from '../types'

type Props = {
  piece: Piece
}

type Mode = 'listen' | 'wait' | 'step'

export function PracticeView({ piece }: Props) {
  const { touchPractice, updatePiece, settings } = useLibrary()
  const range = KEYBOARD_PRESETS[settings.keyCount]
  const player = useRef(new ScorePlayer())
  const [hand, setHand] = useState<Hand>('both')
  const [mode, setMode] = useState<Mode>('step')
  const [tempo, setTempo] = useState(() => Math.max(40, Math.round(piece.tempo * 0.5)))
  const [stepReady, setStepReady] = useState(false)
  const [sectionIdx, setSectionIdx] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [active, setActive] = useState<number[]>([])
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [wrong, setWrong] = useState<number[]>([])
  const [playing, setPlaying] = useState(false)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [holdMs, setHoldMs] = useState<Partial<Record<number, number>>>({})
  const startedAt = useRef<number>(Date.now())
  const pending = useRef<Set<number>>(new Set())
  const hitsRef = useRef(0)
  const missesRef = useRef(0)
  const pieceRef = useRef(piece)
  pieceRef.current = piece
  const handRef = useRef(hand)
  handRef.current = hand
  const modeRef = useRef(mode)
  modeRef.current = mode
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  const sections = useMemo(() => phraseBounds(piece), [piece])
  const section = sections[Math.min(sectionIdx, sections.length - 1)] ?? sections[0]
  const sectionRef = useRef(section)
  sectionRef.current = section
  const duration = sections[0]?.end ?? 0
  const currentNotes = useMemo(
    () => piece.notes.filter((n) => Math.abs(n.time - cursor) < 0.03 && (hand === 'both' || noteHand(n) === hand)),
    [piece.notes, cursor, hand]
  )
  const fingers = useMemo(() => {
    const map: Partial<Record<number, Finger>> = {}
    for (const note of currentNotes) {
      if (note.finger) map[note.midi] = note.finger
    }
    return map
  }, [currentNotes])

  const fromBeat = measureContaining(piece, cursor).start
  const tempoRef = useRef(tempo)
  tempoRef.current = tempo

  function applyHold(notes: { midi: number; duration: number }[]) {
    const msMap: Partial<Record<number, number>> = {}
    for (const note of notes) {
      msMap[note.midi] = (note.duration * 60 * 1000) / tempoRef.current
    }
    setHoldMs(msMap)
  }

  function showEvent(time: number) {
    const current = pieceRef.current
    const notes = current.notes.filter(
      (n) =>
        Math.abs(n.time - time) < 0.03 &&
        (handRef.current === 'both' || noteHand(n) === handRef.current)
    )
    setCursor(time)
    setActiveIds(notes.map((n) => n.id))
    setActive(expectedMidis(current.notes, time, handRef.current))
    applyHold(notes)
  }

  useEffect(() => {
    startedAt.current = Date.now()
    hitsRef.current = 0
    missesRef.current = 0
    setTempo(Math.max(40, Math.round(piece.tempo * 0.5)))
    setMode('step')
    setHits(0)
    setMisses(0)
    setStepReady(false)
    setSectionIdx(0)
    return () => {
      player.current.stop()
      const seconds = Math.round((Date.now() - startedAt.current) / 1000)
      if (seconds >= 5) {
        const total = hitsRef.current + missesRef.current
        void touchPractice(piece.id, seconds, total ? (hitsRef.current / total) * 100 : undefined)
      }
    }
    // piece identity only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.id])

  useEffect(() => {
    const start = firstEvent(piece.notes, section.start, hand) ?? section.start
    setMode('step')
    setPlaying(true)
    setStepReady(false)
    pending.current.clear()
    showEvent(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.id, sectionIdx, hand])

  useEffect(() => {
    const onKey = async (event: KeyboardEvent) => {
      await initAudio()
      const midi = midiFromKeyboardEvent(event)
      if (midi != null) handleInput(midi)
    }
    window.addEventListener('keydown', onKey)
    let unsub = () => undefined as void
    void subscribeMidi((midi, _v, on) => {
      if (on) {
        void initAudio().then(() => handleInput(midi))
      }
    }).then((fn) => {
      unsub = fn
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      unsub()
    }
  }, [])

  function handleInput(midi: number) {
    const current = pieceRef.current
    const waiting = modeRef.current === 'wait' || modeRef.current === 'step'
    const neededNow = expectedMidis(current.notes, cursorRef.current, handRef.current)
    const holdBeats = current.notes.find((n) => Math.abs(n.time - cursorRef.current) < 0.03 && n.midi === midi)?.duration ?? 0.5
    const holdSec = (holdBeats * 60) / tempoRef.current
    playNote(midi, waiting ? Math.max(0.2, holdSec) : 0.35)
    setActive([midi])
    if (!waiting) return
    if (neededNow.length === 0) return
    if (neededNow.includes(midi)) {
      pending.current.add(midi)
      if (neededNow.every((n) => pending.current.has(n))) {
        const chord = current.notes.filter(
          (n) =>
            Math.abs(n.time - cursorRef.current) < 0.03 &&
            (handRef.current === 'both' || noteHand(n) === handRef.current)
        )
        applyHold(chord)
        hitsRef.current += 1
        setHits(hitsRef.current)
        pending.current.clear()
        if (modeRef.current === 'step') {
          setStepReady(true)
          return
        }
        const waitMs = Math.max(...chord.map((n) => (n.duration * 60 * 1000) / tempoRef.current), 400)
        window.setTimeout(() => goNext(), waitMs)
      }
    } else {
      missesRef.current += 1
      setMisses(missesRef.current)
      setWrong([midi])
      window.setTimeout(() => setWrong([]), 240)
    }
  }

  async function startListen() {
    await initAudio()
    setMode('listen')
    setPlaying(true)
    player.current.play(piece, {
      start: section.start,
      end: section.end || duration,
      tempo,
      hand,
      metronome: false,
      onCursor: (time, notes) => {
        setCursor(time)
        setActive(notes.map((n) => n.midi))
        setActiveIds(notes.map((n) => n.id))
        applyHold(notes)
      },
      onEnd: () => {
        setPlaying(false)
        setActive([])
        setActiveIds([])
      }
    })
  }

  function goNext() {
    const current = pieceRef.current
    const next = stepEvent(current.notes, cursorRef.current, handRef.current)
    setStepReady(false)
    pending.current.clear()
    if (next == null || next >= sectionRef.current.end) {
      setPlaying(false)
      setActive([])
      setActiveIds([])
      setHoldMs({})
      return
    }
    showEvent(next)
  }

  function goPrev() {
    const current = pieceRef.current
    const times = [...new Set(current.notes.filter((n) => n.time < cursorRef.current - 0.001).map((n) => n.time))].sort(
      (a, b) => b - a
    )
    const prev = times[0]
    if (prev == null || prev < sectionRef.current.start) return
    setStepReady(false)
    pending.current.clear()
    showEvent(prev)
  }

  async function startStep() {
    await initAudio()
    player.current.stop()
    setMode('step')
    setPlaying(true)
    setStepReady(false)
    pending.current.clear()
    const start = firstEvent(piece.notes, section.start, hand) ?? section.start
    showEvent(start)
  }

  async function startWait() {
    await initAudio()
    player.current.stop()
    setMode('wait')
    setPlaying(true)
    pending.current.clear()
    const start = firstEvent(piece.notes, section.start, hand) ?? section.start
    showEvent(start)
  }

  function stop() {
    player.current.stop()
    setPlaying(false)
    setActive([])
    setActiveIds([])
  }

  const accuracy = hits + misses ? Math.round((hits / (hits + misses)) * 100) : 0

  return (
    <div className="page practice">
      <header className="practice-head">
        <div>
          <p className="eyebrow">Занятие</p>
          <h1>{piece.title}</h1>
          <p className="lead">
            {piece.composer} · {KEY_NAMES[piece.keySignature]} · {range.label}
          </p>
        </div>
        <div className="practice-metrics">
          <span>Точность {accuracy}%</span>
          <span>
            Верно {hits} / ошибки {misses}
          </span>
          <button
            type="button"
            className={piece.favorite ? 'icon-btn on' : 'icon-btn'}
            onClick={() => updatePiece(piece.id, { favorite: !piece.favorite })}
          >
            ★
          </button>
        </div>
      </header>

      <div className="practice-controls">
        <label>
          Руки
          <select value={hand} onChange={(e) => setHand(e.target.value as Hand)}>
            <option value="both">Обе</option>
            <option value="right">Правая</option>
            <option value="left">Левая</option>
          </select>
        </label>
        <label className="tempo">
          Темп {tempo} (пьеса {piece.tempo})
          <input type="range" min={36} max={160} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} />
        </label>
        <div className="btn-row">
          <button type="button" className={mode === 'step' ? 'btn primary' : 'btn'} onClick={() => void startStep()}>
            По одной ноте
          </button>
          <button type="button" className="btn" onClick={goPrev}>
            Назад
          </button>
          <button type="button" className="btn" onClick={goNext}>
            Дальше
          </button>
          <button type="button" className="btn" onClick={() => void startWait()}>
            Жди меня
          </button>
          <button type="button" className="btn ghost" disabled={playing && mode === 'listen'} onClick={() => void startListen()}>
            {sectionIdx === 0 ? 'Слушать всё' : 'Слушать фразу'}
          </button>
          <button type="button" className="btn ghost" onClick={stop}>
            Стоп
          </button>
        </div>
      </div>
      <div className="phrase-rail" role="tablist" aria-label="Фразы">
        {sections.map((item, index) => (
          <button
            key={`${item.label}-${item.start}`}
            type="button"
            role="tab"
            aria-selected={index === sectionIdx}
            className={index === sectionIdx ? 'phrase-chip active' : 'phrase-chip'}
            onClick={() => setSectionIdx(index)}
          >
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>
      <p className="hint">
        {sectionIdx === 0
          ? 'Сейчас выбрана вся пьеса. Можно слушать её целиком или открыть одну фразу и учить её отдельно.'
          : `${section.label}: ${section.detail}. «Слушать фразу» играет только её, «Вся пьеса» — произведение с начала.`}
      </p>

      <div className="score-panel">
        <ScoreView piece={piece} cursorTime={cursor} activeIds={activeIds} fromBeat={fromBeat} />
        <div className="now-playing">
          {stepReady
            ? 'Верно. Посмотрите линию от клавиши к ноте и нажмите «Дальше»'
            : currentNotes.length
              ? currentNotes.map((n) => `${midiToRu(n.midi, piece.keySignature)} · ${beatsToRu(n.duration)}`).join('   ·   ')
              : 'Первая нота фразы откроется сразу. Если пусто — нажмите «По одной ноте»'}
        </div>
      </div>

      <PianoKeyboard
        fromMidi={range.fromMidi}
        toMidi={range.toMidi}
        activeMidis={active}
        expectedMidis={currentNotes.map((n) => n.midi)}
        fingers={fingers}
        wrongMidis={wrong}
        holdMs={holdMs}
        showNames={settings.showNoteNames}
        guideNotes={currentNotes}
        keySignature={piece.keySignature}
        onNote={(midi) => void initAudio().then(() => handleInput(midi))}
      />

      <FingeringCoach notes={currentNotes} />
    </div>
  )
}
