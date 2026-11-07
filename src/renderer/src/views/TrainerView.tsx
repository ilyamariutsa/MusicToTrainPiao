import { useEffect, useMemo, useRef, useState } from 'react'
import { PianoKeyboard } from '../components/PianoKeyboard'
import { StaffNote } from '../components/StaffNote'
import { initAudio, playNote } from '../lib/audio'
import { midiFromKeyboardEvent } from '../lib/keyboardMap'
import { subscribeMidi } from '../lib/midiInput'
import { midiToName, midiToRu } from '../lib/theory'
import { useLibrary } from '../store'
import { KEYBOARD_PRESETS, type Clef } from '../types'

type Scope = 'treble' | 'bass' | 'both'

function randomMidi(clef: Clef): number {
  if (clef === 'treble') return 60 + Math.floor(Math.random() * 17)
  return 43 + Math.floor(Math.random() * 18)
}

function pickClef(scope: Scope): Clef {
  if (scope === 'both') return Math.random() > 0.5 ? 'treble' : 'bass'
  return scope
}

export function TrainerView() {
  const { recordTrainer, stats, settings } = useLibrary()
  const range = KEYBOARD_PRESETS[settings.keyCount]
  const [scope, setScope] = useState<Scope>('both')
  const [clef, setClef] = useState<Clef>('treble')
  const [midi, setMidi] = useState(64)
  const [reveal, setReveal] = useState(false)
  const [message, setMessage] = useState('Нажмите клавишу, которая соответствует ноте')
  const [flash, setFlash] = useState<number[]>([])
  const [wrong, setWrong] = useState<number[]>([])
  const [peeked, setPeeked] = useState(false)
  const midiRef = useRef(midi)
  const scopeRef = useRef(scope)
  /** Only the first answer to a note counts, and never after a peek. */
  const countedRef = useRef(false)
  const peekedRef = useRef(false)
  /** Set once the right key is found: more presses wait for the next note. */
  const solvedRef = useRef(false)
  const nextTimer = useRef<number | null>(null)
  midiRef.current = midi
  scopeRef.current = scope

  const next = (nextScope = scope) => {
    if (nextTimer.current != null) window.clearTimeout(nextTimer.current)
    nextTimer.current = null
    solvedRef.current = false
    const nextClef = pickClef(nextScope)
    setClef(nextClef)
    setMidi(randomMidi(nextClef))
    setReveal(false)
    setPeeked(false)
    countedRef.current = false
    peekedRef.current = false
    setFlash([])
    setWrong([])
    setMessage('Нажмите клавишу, которая соответствует ноте')
  }

  useEffect(() => {
    next(scope)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const value = midiFromKeyboardEvent(event)
      if (value != null) void answer(value)
    }
    window.addEventListener('keydown', onKey)
    const unsub = subscribeMidi((value, velocity, on) => {
      if (on) void answer(value, velocity)
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      unsub()
      if (nextTimer.current != null) window.clearTimeout(nextTimer.current)
    }
  }, [])

  async function answer(value: number, velocity = 0.8) {
    await initAudio()
    playNote(value, 0.4, velocity)
    if (solvedRef.current) return
    const expected = midiRef.current
    const ok = value === expected
    if (ok) solvedRef.current = true
    const counts = !countedRef.current && !peekedRef.current
    const peekedBefore = peekedRef.current
    countedRef.current = true
    setReveal(true)
    if (counts) await recordTrainer(ok)
    if (ok) {
      setFlash([value])
      setMessage(
        counts
          ? `Верно: ${midiToRu(expected)} (${midiToName(expected)})`
          : peekedBefore
            ? `Да, это ${midiToRu(expected)}. С подсказкой — в статистику не идёт`
            : `Да, это ${midiToRu(expected)}. В статистику идёт первый ответ`
      )
      nextTimer.current = window.setTimeout(() => next(scopeRef.current), 700)
    } else {
      setWrong([value])
      setFlash([expected])
      setMessage(`Это ${midiToRu(expected)} (${midiToName(expected)}). Запомните, где она лежит.`)
    }
  }

  const accuracy = useMemo(
    () => (stats.trainerTotal ? Math.round((stats.trainerCorrect / stats.trainerTotal) * 100) : 0),
    [stats]
  )

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Тренажёр нот</p>
          <h1>Нота, ключ и клавиша — одна картинка в голове</h1>
          <p className="lead">
            Скрипичный ключ — правая рука, басовый — левая. Сначала узнаём ноту глазами, потом находим её на
            клавиатуре и слышим.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <strong>{accuracy}%</strong>
            <span>Точность</span>
          </div>
          <div className="stat">
            <strong>{stats.trainerTotal}</strong>
            <span>Попыток</span>
          </div>
        </div>
      </header>

      <div className="chips">
        {(
          [
            ['treble', 'Скрипичный'],
            ['bass', 'Басовый'],
            ['both', 'Оба ключа']
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={scope === id ? 'chip active' : 'chip'} onClick={() => setScope(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="trainer-layout">
        <StaffNote midi={midi} clef={clef} reveal={reveal} />
        <div className="trainer-side">
          <p className="now-playing">{message}</p>
          <button type="button" className="btn" onClick={() => void initAudio().then(() => playNote(midi, 0.6))}>
            Подсказать звуком
          </button>
          {settings.beginnerMode && !reveal && !peeked ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                peekedRef.current = true
                setPeeked(true)
              }}
            >
              Подсмотреть клавишу
            </button>
          ) : null}
        </div>
      </div>

      <PianoKeyboard
        fromMidi={range.fromMidi}
        toMidi={range.toMidi}
        expectedMidis={reveal || peeked ? [midi] : []}
        activeMidis={flash}
        wrongMidis={wrong}
        showNames={settings.showNoteNames}
        onNote={(value) => void answer(value)}
      />
    </div>
  )
}
