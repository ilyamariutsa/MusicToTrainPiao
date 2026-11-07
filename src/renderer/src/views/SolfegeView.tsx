import { useEffect, useRef, useState } from 'react'
import { PianoKeyboard } from '../components/PianoKeyboard'
import { StaffNote } from '../components/StaffNote'
import { initAudio, playNote, playNotes } from '../lib/audio'
import { midiToRu } from '../lib/theory'
import { useLibrary } from '../store'
import { KEYBOARD_PRESETS } from '../types'

type Tab = 'intervals' | 'degrees' | 'triads' | 'naming'

const TABS: Array<[Tab, string]> = [
  ['intervals', 'Интервалы'],
  ['degrees', 'Ступени'],
  ['triads', 'Мажор / минор'],
  ['naming', 'Имя ноты']
]

const INTERVALS = [
  { semitones: 0, name: 'Прима', hint: 'Та же нота, без шага' },
  { semitones: 2, name: 'Большая секунда', hint: 'Соседняя ступень: до → ре' },
  { semitones: 3, name: 'Малая терция', hint: 'до → ми♭, грустный шаг' },
  { semitones: 4, name: 'Большая терция', hint: 'до → ми, светлый шаг' },
  { semitones: 5, name: 'Кварта', hint: 'до → фа' },
  { semitones: 7, name: 'Квинта', hint: 'до → соль' },
  { semitones: 9, name: 'Большая секста', hint: 'до → ля' },
  { semitones: 12, name: 'Октава', hint: 'до → до выше' }
]

const DEGREES = ['I тоника', 'II', 'III', 'IV субдоминанта', 'V доминанта', 'VI', 'VII вводный']
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const TONIC = 60

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** A start note between G3 and G4, so intervals and chords are judged by ear, not by the pitch of one note. */
function randomRoot(): number {
  return 55 + Math.floor(Math.random() * 13)
}

type Score = { right: number; total: number }

export function SolfegeView() {
  const { settings } = useLibrary()
  const range = KEYBOARD_PRESETS[settings.keyCount]
  const [tab, setTab] = useState<Tab>('intervals')
  const [message, setMessage] = useState('Нажмите «Новый вопрос» — звук включится с первого нажатия')
  const [flash, setFlash] = useState<number[]>([])
  const [nameMidi, setNameMidi] = useState(64)
  // While a question is open the keyboard shows nothing: the answer is by ear.
  const [open, setOpen] = useState(false)
  const [score, setScore] = useState<Record<Tab, Score>>({
    intervals: { right: 0, total: 0 },
    degrees: { right: 0, total: 0 },
    triads: { right: 0, total: 0 },
    naming: { right: 0, total: 0 }
  })
  const rootRef = useRef(TONIC)
  const intervalRef = useRef(7)
  const degreeRef = useRef(4)
  const triadMajorRef = useRef(true)
  const nameRef = useRef(64)
  /** Each playback gets a number; a newer one silently ends the older loop. */
  const playback = useRef(0)
  const answered = useRef(true)

  useEffect(
    () => () => {
      playback.current += 1
    },
    []
  )

  async function ready(): Promise<boolean> {
    try {
      await initAudio()
      return true
    } catch {
      setMessage('Звук не открылся. Нажмите «Слушать» ещё раз.')
      return false
    }
  }

  async function hearInterval() {
    if (!(await ready())) return
    const run = ++playback.current
    const root = rootRef.current
    setFlash([root])
    playNote(root, 0.55)
    await sleep(520)
    if (run !== playback.current) return
    setFlash([root, root + intervalRef.current])
    playNote(root + intervalRef.current, 0.75)
  }

  /** The key is set by its tonic chord, then the degree sounds on its own. */
  async function hearDegree() {
    if (!(await ready())) return
    const run = ++playback.current
    setFlash([TONIC, TONIC + 4, TONIC + 7])
    playNotes([TONIC - 12, TONIC, TONIC + 4, TONIC + 7], 0.9)
    await sleep(1000)
    if (run !== playback.current) return
    const note = TONIC + MAJOR[degreeRef.current]
    setFlash([note])
    playNote(note, 0.9)
  }

  async function hearTriad() {
    if (!(await ready())) return
    playback.current += 1
    const root = rootRef.current
    const chord = triadMajorRef.current ? [root, root + 4, root + 7] : [root, root + 3, root + 7]
    setFlash(chord)
    playNotes(chord, 1.2)
  }

  async function hearName() {
    if (!(await ready())) return
    playback.current += 1
    playNote(nameRef.current, 0.7)
  }

  function ask(text: string) {
    answered.current = false
    setOpen(true)
    setMessage(text)
  }

  /** Records the first answer to a question and reveals the keys. */
  function answer(right: boolean, text: string) {
    if (!answered.current) {
      answered.current = true
      setScore((s) => ({ ...s, [tab]: { right: s[tab].right + (right ? 1 : 0), total: s[tab].total + 1 } }))
    }
    setOpen(false)
    setMessage(text)
  }

  async function newInterval() {
    const next = INTERVALS[Math.floor(Math.random() * INTERVALS.length)]
    rootRef.current = randomRoot()
    intervalRef.current = next.semitones
    ask('Какой это интервал? Послушайте и выберите название.')
    await hearInterval()
  }

  async function newDegree() {
    degreeRef.current = Math.floor(Math.random() * 7)
    ask('Сначала звучит аккорд до мажора, потом одна нота. Какая это ступень?')
    await hearDegree()
  }

  async function newTriad() {
    rootRef.current = randomRoot()
    triadMajorRef.current = Math.random() > 0.45
    ask('Мажор или минор?')
    await hearTriad()
  }

  async function newName() {
    const midi = 55 + Math.floor(Math.random() * 20)
    nameRef.current = midi
    setNameMidi(midi)
    ask('Какая это нота? Нажмите её на клавиатуре')
    await hearName()
  }

  const current = score[tab]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Сольфеджио</p>
          <h1>Слух, ступени и имена нот</h1>
          <p className="lead">Нажмите «Новый вопрос», послушайте и ответьте. Клавиши подсвечиваются только после ответа.</p>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <strong>{current.total ? `${current.right} из ${current.total}` : '—'}</strong>
            <span>Верно в этом разделе</span>
          </div>
        </div>
      </header>

      <div className="chips">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'chip active' : 'chip'}
            onClick={() => {
              playback.current += 1
              answered.current = true
              setOpen(false)
              setFlash([])
              setTab(id)
              setMessage('Нажмите «Новый вопрос»')
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="now-playing">{message}</p>

      {tab === 'intervals' ? (
        <div className="panel">
          <div className="btn-row" style={{ marginLeft: 0 }}>
            <button type="button" className="btn primary" onClick={() => void newInterval()}>
              Новый вопрос
            </button>
            <button type="button" className="btn" onClick={() => void hearInterval()}>
              Слушать ещё раз
            </button>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {INTERVALS.map((item) => (
              <button
                key={item.name}
                type="button"
                className="chip"
                onClick={() =>
                  answer(
                    item.semitones === intervalRef.current,
                    item.semitones === intervalRef.current
                      ? `Верно: ${item.name}. ${item.hint}`
                      : `Нет, это ${INTERVALS.find((i) => i.semitones === intervalRef.current)?.name.toLowerCase()}.`
                  )
                }
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'degrees' ? (
        <div className="panel">
          <p>Тональность до мажор: до ре ми фа соль ля си.</p>
          <div className="btn-row" style={{ marginLeft: 0 }}>
            <button type="button" className="btn primary" onClick={() => void newDegree()}>
              Новый вопрос
            </button>
            <button type="button" className="btn" onClick={() => void hearDegree()}>
              Слушать ещё раз
            </button>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {DEGREES.map((label, idx) => (
              <button
                key={label}
                type="button"
                className="chip"
                onClick={() =>
                  answer(
                    idx === degreeRef.current,
                    idx === degreeRef.current ? `Верно: ${label}` : `Нет, это ${DEGREES[degreeRef.current]}.`
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'triads' ? (
        <div className="panel">
          <p>Три звука вместе. Мажор светлее, минор мягче.</p>
          <div className="btn-row" style={{ marginLeft: 0 }}>
            <button type="button" className="btn primary" onClick={() => void newTriad()}>
              Новый вопрос
            </button>
            <button type="button" className="btn" onClick={() => void hearTriad()}>
              Слушать ещё раз
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => answer(triadMajorRef.current, triadMajorRef.current ? 'Верно, это мажор' : 'Нет, это минор')}
            >
              Мажор
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => answer(!triadMajorRef.current, triadMajorRef.current ? 'Нет, это мажор' : 'Верно, это минор')}
            >
              Минор
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'naming' ? (
        <div className="trainer-layout">
          <StaffNote midi={nameMidi} clef={nameMidi >= 60 ? 'treble' : 'bass'} reveal={!open} />
          <div className="trainer-side">
            <button type="button" className="btn primary" onClick={() => void newName()}>
              Новый вопрос
            </button>
            <button type="button" className="btn" onClick={() => void hearName()}>
              Слушать ещё раз
            </button>
            <button type="button" className="btn" onClick={() => answer(false, `Это ${midiToRu(nameRef.current)}`)}>
              Показать ответ
            </button>
          </div>
        </div>
      ) : null}

      <PianoKeyboard
        fromMidi={range.fromMidi}
        toMidi={range.toMidi}
        activeMidis={open ? [] : flash}
        expectedMidis={open ? [] : tab === 'naming' ? [nameMidi] : flash}
        showNames={settings.showNoteNames}
        onNote={(midi) => {
          void ready().then((ok) => {
            if (!ok) return
            playNote(midi, 0.45)
            if (tab === 'naming' && open) {
              answer(
                midi === nameRef.current,
                midi === nameRef.current ? `Верно: ${midiToRu(nameRef.current)}` : `Нет, это ${midiToRu(nameRef.current)}`
              )
              setFlash([nameRef.current])
            }
          })
        }}
      />
    </div>
  )
}
