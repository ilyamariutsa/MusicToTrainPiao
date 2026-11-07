import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { guideRange } from '../components/KeyStaffMap'
import { PianoKeyboard } from '../components/PianoKeyboard'
import { ScoreView } from '../components/ScoreView'
import { initAudio, playNote, playNotes } from '../lib/audio'
import { midiFromKeyboardEvent } from '../lib/keyboardMap'
import { subscribeMidi } from '../lib/midiInput'
import { expectedMidis, firstEvent, playable, ScorePlayer, stepEvent } from '../lib/player'
import {
  beatsToRu,
  keyName,
  measureContaining,
  midiToRu,
  noteHand,
  phraseBounds,
  soundingBeats,
  type PhraseSpan
} from '../lib/theory'
import { MIN_ATTEMPTS_FOR_ACCURACY, useLibrary } from '../store'
import type { Finger, Hand, Piece, ScoreNote } from '../types'

type Props = {
  piece: Piece
}

type Mode = 'listen' | 'step' | 'rhythm'

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'listen', label: 'Слушать', hint: 'Пьеса играет сама, ноты и клавиши подсвечиваются' },
  { id: 'step', label: 'По нотам', hint: 'Следующая нота открывается, как только вы сыграли верно' },
  { id: 'rhythm', label: 'В ритме', hint: 'Пьеса ждёт верных клавиш и держит длительности' }
]

const HANDS: Array<{ id: Hand; label: string }> = [
  { id: 'left', label: 'Левая' },
  { id: 'both', label: 'Обе' },
  { id: 'right', label: 'Правая' }
]

const TEMPO_MIN = 20
const TEMPO_MAX = 150
/** Pause before the next note opens in "По нотам", long enough to see the hit. */
const STEP_PAUSE_MS = 220
/** Reading the score counts as practice for this long after the last key. */
const IDLE_AFTER_MS = 90_000

export function PracticeView({ piece }: Props) {
  const { touchPractice, updatePiece, updateSettings, settings } = useLibrary()
  const player = useRef(new ScorePlayer())
  const [mode, setMode] = useState<Mode>('step')
  const [hand, setHand] = useState<Hand>('both')
  const [tempoPct, setTempoPct] = useState(100)
  const [loop, setLoop] = useState(false)
  const [click, setClick] = useState(false)
  const [sectionIdx, setSectionIdx] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [active, setActive] = useState<number[]>([])
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [wrong, setWrong] = useState<number[]>([])
  const [listening, setListening] = useState(false)
  const [done, setDone] = useState(false)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [holdMs, setHoldMs] = useState<Partial<Record<number, number>>>({})

  /** Practice time not yet saved; only time spent playing or listening counts. */
  const unsavedSeconds = useRef(0)
  const lastActivity = useRef(Date.now())
  const pending = useRef<Set<number>>(new Set())
  const advanceTimer = useRef<number | null>(null)
  const hitsRef = useRef(0)
  const missesRef = useRef(0)

  const sections = useMemo(() => phraseBounds(piece), [piece])
  const section = sections[Math.min(sectionIdx, sections.length - 1)] ?? sections[0]
  const keysShown = useMemo(() => guideRange(piece.notes), [piece.notes])
  const lengths = useMemo(() => soundingBeats(piece.notes), [piece.notes])
  const bpm = Math.max(12, Math.round((piece.tempo * tempoPct) / 100))

  // Keys to press now; a tied continuation is held, not pressed again.
  const currentNotes = useMemo(
    () =>
      piece.notes
        .filter((n) => !n.tied && Math.abs(n.time - cursor) < 0.03 && (hand === 'both' || noteHand(n) === hand))
        .sort((a, b) => b.midi - a.midi),
    [piece.notes, cursor, hand]
  )
  const fingers = useMemo(() => {
    const map: Partial<Record<number, Finger>> = {}
    for (const note of currentNotes) if (note.finger) map[note.midi] = note.finger
    return map
  }, [currentNotes])
  const fromBeat = measureContaining(piece, cursor).start

  // Everything the long-lived keyboard/MIDI listeners and timers read lives here, always current.
  const live = useRef({ piece, mode, hand, section, cursor, bpm, loop, click, lengths, done })
  live.current = { piece, mode, hand, section, cursor, bpm, loop, click, lengths, done }

  function clearAdvance(): void {
    if (advanceTimer.current != null) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = null
  }

  /** Hold bars last as long as the note sounds, ties included. */
  function applyHold(notes: ScoreNote[]): void {
    const { lengths: map, bpm: now } = live.current
    const msMap: Partial<Record<number, number>> = {}
    for (const note of notes) msMap[note.midi] = ((map.get(note.id) ?? note.duration) * 60000) / now
    setHoldMs(msMap)
  }

  function showEvent(time: number): void {
    const { piece: current, hand: h } = live.current
    const notes = playable(current.notes, h).filter((n) => Math.abs(n.time - time) < 0.03)
    live.current.cursor = time
    setCursor(time)
    setDone(false)
    live.current.done = false
    setActiveIds(notes.map((n) => n.id))
    setActive(expectedMidis(current.notes, time, h))
    applyHold(notes)
  }

  function resetToStart(): void {
    clearAdvance()
    pending.current.clear()
    const { piece: current, section: s, hand: h } = live.current
    showEvent(firstEvent(current.notes, s.start, h) ?? s.start)
  }

  function finish(): void {
    clearAdvance()
    pending.current.clear()
    live.current.done = true
    setDone(true)
    setActive([])
    setActiveIds([])
    setHoldMs({})
  }

  function stopListening(): void {
    player.current.stop()
    setListening(false)
  }

  async function startListening(): Promise<void> {
    await initAudio()
    clearAdvance()
    const { piece: current, section: s, hand: h, bpm: now, click: withClick } = live.current
    live.current.mode = 'listen'
    setMode('listen')
    setListening(true)
    setDone(false)
    player.current.play(current, {
      start: s.start,
      end: s.end,
      tempo: now,
      hand: h,
      metronome: withClick,
      onCursor: (time, notes) => {
        live.current.cursor = time
        setCursor(time)
        setActive(notes.map((n) => n.midi))
        setActiveIds(notes.map((n) => n.id))
        applyHold(notes)
      },
      onEnd: () => {
        if (live.current.loop && live.current.mode === 'listen') {
          void api.current.startListening()
          return
        }
        setListening(false)
        setActive([])
        setActiveIds([])
        setHoldMs({})
      }
    })
  }

  function selectMode(next: Mode): void {
    stopListening()
    clearAdvance()
    live.current.mode = next
    setMode(next)
    if (next === 'listen') {
      setActive([])
      setHoldMs({})
    } else {
      resetToStart()
    }
  }

  function goNext(): void {
    clearAdvance()
    pending.current.clear()
    const { piece: current, cursor: at, hand: h, section: s } = live.current
    const next = stepEvent(current.notes, at, h)
    if (next == null || next >= s.end - 0.001) finish()
    else showEvent(next)
  }

  function goPrev(): void {
    lastActivity.current = Date.now()
    clearAdvance()
    pending.current.clear()
    const { piece: current, cursor: at, hand: h, section: s, done: finished } = live.current
    const before = playable(current.notes, h)
      .map((n) => n.time)
      .filter((t) => t >= s.start - 0.001 && (finished ? t < s.end - 0.001 : t < at - 0.001))
    if (before.length) showEvent(Math.max(...before))
  }

  /** Plays the notes to press now, to hear what they should sound like. */
  async function hearCurrent(): Promise<void> {
    lastActivity.current = Date.now()
    await initAudio()
    const { piece: current, cursor: at, hand: h } = live.current
    const notes = playable(current.notes, h).filter((n) => Math.abs(n.time - at) < 0.03)
    if (notes.length) playNotes(notes.map((n) => n.midi), 0.9, 0.75)
  }

  function togglePlay(): void {
    lastActivity.current = Date.now()
    if (live.current.mode !== 'listen') {
      void hearCurrent()
      return
    }
    if (player.current.isPlaying()) stopListening()
    else void startListening()
  }

  /** `velocity` 0–1 comes from a MIDI keyboard; mouse and computer keys play mezzo-forte. */
  function handleInput(midi: number, velocity = 0.8): void {
    lastActivity.current = Date.now()
    if (advanceTimer.current != null) {
      const { piece: current, mode: m, hand: h, cursor: at } = live.current
      // A quick next key belongs to the next note: in "По нотам" always, in "В ритме" when it
      // is one of the next notes played a little early.
      const next = stepEvent(current.notes, at, h)
      const early = m === 'rhythm' && next != null && expectedMidis(current.notes, next, h).includes(midi)
      if (m === 'step' || early) goNext()
    }
    const { piece: current, mode: m, hand: h, cursor: at, lengths: map, bpm: now, section: s, done: finished } = live.current
    const target = playable(current.notes, h).find((n) => Math.abs(n.time - at) < 0.03 && n.midi === midi)
    const holdSec = ((target ? map.get(target.id) ?? target.duration : 0.5) * 60) / now
    playNote(midi, m === 'listen' ? 0.6 : Math.max(0.25, holdSec), velocity)
    if (m === 'listen' || finished || advanceTimer.current != null) return
    setActive([midi])
    const needed = expectedMidis(current.notes, at, h)
    if (needed.length === 0) return
    if (!needed.includes(midi)) {
      missesRef.current += 1
      setMisses(missesRef.current)
      setWrong([midi])
      window.setTimeout(() => setWrong([]), 260)
      return
    }
    pending.current.add(midi)
    if (!needed.every((n) => pending.current.has(n))) return
    pending.current.clear()
    hitsRef.current += 1
    setHits(hitsRef.current)
    applyHold(playable(current.notes, h).filter((n) => Math.abs(n.time - at) < 0.03))
    // "В ритме" waits until the next note is due, "По нотам" moves on right away.
    const next = stepEvent(current.notes, at, h)
    const beats = m === 'rhythm' ? (next == null || next >= s.end - 0.001 ? s.end - at : next - at) : 0
    const wait = m === 'rhythm' ? Math.max(120, (beats * 60000) / now) : STEP_PAUSE_MS
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null
      api.current.goNext()
    }, wait)
  }

  const api = useRef({ handleInput, togglePlay, goNext, goPrev, startListening })
  api.current = { handleInput, togglePlay, goNext, goPrev, startListening }

  // New piece: fresh session. Practice time is counted only while playing or listening
  // (idle, hidden or asleep does not count) and saved every half minute, so closing the
  // window loses next to nothing; accuracy is saved at the end once there were enough attempts.
  useEffect(() => {
    hitsRef.current = 0
    missesRef.current = 0
    unsavedSeconds.current = 0
    lastActivity.current = Date.now()
    setHits(0)
    setMisses(0)
    setTempoPct(100)
    setSectionIdx(0)
    live.current.mode = 'step'
    setMode('step')
    const keep = player.current
    const id = piece.id

    const save = (final: boolean): void => {
      const seconds = Math.floor(unsavedSeconds.current)
      unsavedSeconds.current -= seconds
      const total = hitsRef.current + missesRef.current
      const accuracy = final && total >= MIN_ATTEMPTS_FOR_ACCURACY ? (hitsRef.current / total) * 100 : undefined
      if (seconds > 0 || accuracy != null) void touchPractice(id, seconds, accuracy)
    }
    let last = Date.now()
    const clock = window.setInterval(() => {
      const now = Date.now()
      const engaged =
        document.visibilityState === 'visible' && (keep.isPlaying() || now - lastActivity.current < IDLE_AFTER_MS)
      if (engaged) unsavedSeconds.current += Math.min(5, (now - last) / 1000)
      last = now
      if (unsavedSeconds.current >= 30) save(false)
    }, 1000)
    const onClose = (): void => save(true)
    window.addEventListener('beforeunload', onClose)

    return () => {
      window.clearInterval(clock)
      window.removeEventListener('beforeunload', onClose)
      keep.stop()
      clearAdvance()
      save(true)
    }
    // piece identity only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.id])

  // Another phrase or hand: stop and start that phrase from its first note.
  useEffect(() => {
    stopListening()
    resetToStart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.id, sectionIdx, hand])

  useEffect(() => {
    if (player.current.isPlaying()) player.current.setTempo(bpm)
  }, [bpm])

  // Computer keyboard, MIDI keyboard and shortcuts: Space — play / hear the note, ← → — step.
  useEffect(() => {
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
    const onKey = (event: KeyboardEvent): void => {
      if (typing(event.target)) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) api.current.togglePlay()
        return
      }
      if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
        event.preventDefault()
        if (live.current.mode !== 'listen') {
          if (event.code === 'ArrowRight') api.current.goNext()
          else api.current.goPrev()
        }
        return
      }
      const midi = midiFromKeyboardEvent(event)
      if (midi != null) void initAudio().then(() => api.current.handleInput(midi))
    }
    // A focused button must not also react to Space.
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space' && !typing(event.target)) event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    const unsub = subscribeMidi((midi, velocity, on) => {
      if (on) void initAudio().then(() => api.current.handleInput(midi, velocity))
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      unsub()
    }
  }, [])

  const total = hits + misses
  const accuracy = total ? Math.round((hits / total) * 100) : null
  const meter = piece.timeSignature.join('/')
  const caption = done
    ? 'Фраза пройдена. «Сначала» — ещё раз, или выберите следующую фразу.'
    : currentNotes.length
      ? currentNotes.map((n) => noteLabel(n, piece.keySignature)).join('   ·   ')
      : mode === 'listen'
        ? 'Нажмите «Слушать» или Пробел'
        : 'В этой фразе нет нот для выбранной руки'

  return (
    <div className="page practice">
      <header className="practice-top">
        <div className="practice-title">
          <h1>{piece.title}</h1>
          <p>
            {piece.composer} · {keyName(piece.keySignature, piece.mode)} · {meter} · {piece.tempo} уд/мин
          </p>
        </div>
        <div className="practice-stats">
          <span className="pill" title="Верно сыграно / ошибок">
            ✓ {hits} · ✗ {misses}
          </span>
          <span className="pill" title="Точность за это занятие">
            {accuracy == null ? 'Точность —' : `Точность ${accuracy}%`}
          </span>
          <button
            type="button"
            className={piece.favorite ? 'icon-btn on' : 'icon-btn'}
            onClick={() => void updatePiece(piece.id, { favorite: !piece.favorite })}
            title={piece.favorite ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={piece.favorite}
          >
            ★
          </button>
        </div>
      </header>

      <section className="transport" aria-label="Управление занятием">
        <Segmented label="Режим" value={mode} options={MODES} onChange={selectMode} />

        <div className="transport-actions">
          {mode === 'listen' ? (
            <>
              <button
                type="button"
                className="btn primary play"
                onClick={togglePlay}
                title="Пробел"
                aria-label={listening ? 'Остановить' : 'Слушать'}
              >
                <Icon name={listening ? 'stop' : 'play'} />
                {listening ? 'Стоп' : sectionIdx === 0 ? 'Слушать всё' : 'Слушать фразу'}
              </button>
              <IconToggle on={loop} onChange={setLoop} icon="loop" label="Повторять по кругу" />
              <IconToggle on={click} onChange={setClick} icon="metronome" label="Метроном (со следующего запуска)" />
            </>
          ) : (
            <>
              <IconButton icon="prev" label="Предыдущая нота (←)" onClick={goPrev} />
              <IconButton icon="next" label="Следующая нота (→)" onClick={goNext} />
              <IconButton icon="restart" label="Сначала фразы" onClick={resetToStart} />
              <IconButton icon="sound" label="Послушать, что играть (Пробел)" onClick={() => void hearCurrent()} />
            </>
          )}
        </div>

        <Segmented label="Руки" value={hand} options={HANDS} onChange={setHand} />

        <div className="tempo-stepper" title={`Темп пьесы ${piece.tempo} уд/мин`}>
          <button type="button" onClick={() => setTempoPct((v) => Math.max(TEMPO_MIN, v - 10))} aria-label="Медленнее">
            −
          </button>
          <button type="button" className="tempo-value" onClick={() => setTempoPct(100)} title="Вернуть темп пьесы">
            <strong>{tempoPct}%</strong>
            <span>{bpm} уд/мин</span>
          </button>
          <button type="button" onClick={() => setTempoPct((v) => Math.min(TEMPO_MAX, v + 10))} aria-label="Быстрее">
            +
          </button>
        </div>
      </section>

      <PhraseStrip sections={sections} selected={sectionIdx} cursor={cursor} onSelect={setSectionIdx} />

      <div className="score-panel">
        <ScoreView piece={piece} cursorTime={cursor} activeIds={activeIds} fromBeat={fromBeat} />
        <div className={done ? 'now-playing done' : 'now-playing'}>{caption}</div>
      </div>

      <div className="keys-bar">
        <span className="keys-hint">
          Клавиатура компьютера: Z–M и Q–I · Пробел — {mode === 'listen' ? 'слушать' : 'послушать ноту'} · ← → — шаг
        </span>
        <button
          type="button"
          className={settings.showStaffGuide ? 'chip active' : 'chip'}
          onClick={() => void updateSettings({ showStaffGuide: !settings.showStaffGuide })}
          aria-pressed={settings.showStaffGuide}
        >
          Схема «клавиша — нота»
        </button>
      </div>
      <PianoKeyboard
        fromMidi={keysShown[0]}
        toMidi={keysShown[1]}
        activeMidis={active}
        expectedMidis={currentNotes.map((n) => n.midi)}
        fingers={fingers}
        wrongMidis={wrong}
        holdMs={holdMs}
        showNames={settings.showNoteNames}
        guideNotes={settings.showStaffGuide ? currentNotes : undefined}
        guideRange={keysShown}
        keySignature={piece.keySignature}
        legend={false}
        onNote={(midi) => void initAudio().then(() => api.current.handleInput(midi))}
      />
    </div>
  )
}

/** "П · Ми 5 · четверть · 3-й палец". */
function noteLabel(note: ScoreNote, keySignature: number): string {
  const side = noteHand(note) === 'right' ? 'П' : 'Л'
  const finger = note.finger ? ` · ${note.finger}-й палец` : ''
  return `${side} · ${midiToRu(note.midi, keySignature, note)} · ${beatsToRu(note.duration)}${finger}`
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: Array<{ id: T; label: string; hint?: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={value === option.id ? 'on' : ''}
          title={option.hint}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Whole piece plus its phrases, sized by length, with the play position on top. */
function PhraseStrip({
  sections,
  selected,
  cursor,
  onSelect
}: {
  sections: PhraseSpan[]
  selected: number
  cursor: number
  onSelect: (index: number) => void
}) {
  const whole = sections[0]
  const phrases = sections.slice(1)
  const length = Math.max(0.001, whole.end - whole.start)
  const at = Math.min(100, Math.max(0, ((cursor - whole.start) / length) * 100))
  return (
    <div className="phrase-strip">
      <button
        type="button"
        className={selected === 0 ? 'phrase-all on' : 'phrase-all'}
        onClick={() => onSelect(0)}
        title={`Вся пьеса, ${whole.detail}`}
      >
        Вся пьеса
      </button>
      <div className="phrase-track">
        {phrases.map((item, i) => (
          <button
            key={`${item.start}-${item.end}`}
            type="button"
            className={selected === i + 1 ? 'phrase-seg on' : 'phrase-seg'}
            style={{ flexGrow: item.end - item.start }}
            onClick={() => onSelect(i + 1)}
            title={`${item.label}: ${item.detail}`}
          >
            <strong>{i + 1}</strong>
            <span>{item.detail.replace('такты ', 'т. ').replace('такт ', 'т. ')}</span>
          </button>
        ))}
        {phrases.length === 0 ? <div className="phrase-seg solo">{whole.detail}</div> : null}
        <span className="phrase-head" style={{ left: `${at}%` }} aria-hidden="true" />
      </div>
    </div>
  )
}

function IconButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn icon" onClick={onClick} title={label} aria-label={label}>
      <Icon name={icon} />
    </button>
  )
}

function IconToggle({
  on,
  onChange,
  icon,
  label
}: {
  on: boolean
  onChange: (on: boolean) => void
  icon: IconName
  label: string
}) {
  return (
    <button
      type="button"
      className={on ? 'btn icon on' : 'btn icon'}
      onClick={() => onChange(!on)}
      title={label}
      aria-label={label}
      aria-pressed={on}
    >
      <Icon name={icon} />
    </button>
  )
}

type IconName = 'play' | 'stop' | 'prev' | 'next' | 'restart' | 'sound' | 'loop' | 'metronome'

const ICONS: Record<IconName, ReactNode> = {
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />,
  prev: <path d="M7 6v12M18 6.5v11L9.5 12z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  next: <path d="M17 6v12M6 6.5v11l8.5-5.5z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  restart: (
    <>
      <path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.5 3.5v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  loop: (
    <path
      d="M5 11V9a3 3 0 0 1 3-3h10m-3-3 3 3-3 3M19 13v2a3 3 0 0 1-3 3H6m3 3-3-3 3-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  metronome: (
    <>
      <path d="M9.5 3.5h5l4 17h-13z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 16l5-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  )
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}
