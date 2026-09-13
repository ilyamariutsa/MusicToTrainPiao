import { useRef, useState } from 'react'
import { PianoKeyboard } from '../components/PianoKeyboard'
import { StaffNote } from '../components/StaffNote'
import { initAudio, playNote, playNotes } from '../lib/audio'
import { midiToRu } from '../lib/theory'
import { useLibrary } from '../store'
import { KEYBOARD_PRESETS } from '../types'

type Tab = 'intervals' | 'degrees' | 'triads' | 'naming'

const INTERVALS = [
  { semitones: 0, name: 'Прима', hint: 'Та же нота, без шага' },
  { semitones: 2, name: 'Большая секунда', hint: 'Соседняя ступень: до → ре' },
  { semitones: 4, name: 'Большая терция', hint: 'до → ми, светлый шаг' },
  { semitones: 5, name: 'Кварта', hint: 'до → фа' },
  { semitones: 7, name: 'Квинта', hint: 'до → соль' },
  { semitones: 9, name: 'Большая секста', hint: 'до → ля' },
  { semitones: 12, name: 'Октава', hint: 'до → до выше' }
]

const DEGREES = ['I тоника', 'II', 'III', 'IV субдоминанта', 'V доминанта', 'VI', 'VII вводный']
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const ROOT = 60

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function SolfegeView() {
  const { settings } = useLibrary()
  const range = KEYBOARD_PRESETS[settings.keyCount]
  const [tab, setTab] = useState<Tab>('intervals')
  const [message, setMessage] = useState('Нажмите «Слушать» — без этого браузер не даст звук')
  const [flash, setFlash] = useState<number[]>([])
  const [nameMidi, setNameMidi] = useState(64)
  const [busy, setBusy] = useState(false)
  const intervalRef = useRef(7)
  const degreeRef = useRef(4)
  const triadMajorRef = useRef(true)
  const nameRef = useRef(64)

  async function ready(): Promise<boolean> {
    try {
      await initAudio()
      return true
    } catch {
      setMessage('Звук не открылся. Нажмите «Слушать» ещё раз.')
      return false
    }
  }

  async function hearInterval(semi = intervalRef.current) {
    if (!(await ready()) || busy) return
    setBusy(true)
    setFlash([ROOT])
    playNote(ROOT, 0.55)
    await sleep(520)
    setFlash([ROOT, ROOT + semi])
    playNote(ROOT + semi, 0.75)
    setBusy(false)
  }

  async function hearDegree(idx = degreeRef.current) {
    if (!(await ready()) || busy) return
    setBusy(true)
    for (let i = 0; i <= idx; i += 1) {
      playNote(ROOT + MAJOR[i], 0.22)
      setFlash([ROOT + MAJOR[i]])
      await sleep(170)
    }
    await sleep(120)
    playNote(ROOT + MAJOR[idx], 0.8)
    setFlash([ROOT + MAJOR[idx]])
    setBusy(false)
  }

  async function hearTriad(major = triadMajorRef.current) {
    if (!(await ready()) || busy) return
    const chord = major ? [60, 64, 67] : [60, 63, 67]
    setFlash(chord)
    playNotes(chord, 1.2)
  }

  async function hearName(midi = nameRef.current) {
    if (!(await ready())) return
    setFlash([midi])
    playNote(midi, 0.7)
  }

  async function newInterval() {
    const next = INTERVALS[Math.floor(Math.random() * INTERVALS.length)]
    intervalRef.current = next.semitones
    setMessage('Какой это интервал? Сначала послушайте, потом выберите название.')
    await hearInterval(next.semitones)
  }

  async function newDegree() {
    const idx = Math.floor(Math.random() * 7)
    degreeRef.current = idx
    setMessage('Какая ступень гаммы до мажор?')
    await hearDegree(idx)
  }

  async function newTriad() {
    const major = Math.random() > 0.45
    triadMajorRef.current = major
    setMessage('Мажор или минор?')
    await hearTriad(major)
  }

  async function newName() {
    const midi = 55 + Math.floor(Math.random() * 20)
    nameRef.current = midi
    setNameMidi(midi)
    setMessage('Назовите ноту и нажмите её на пианино')
    await hearName(midi)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Сольфеджио</p>
          <h1>Слух, ступени и имена нот</h1>
          <p className="lead">Нажмите «Слушать» или «Новый вопрос» — звук включается с первого нажатия.</p>
        </div>
      </header>

      <div className="chips">
        {(
          [
            ['intervals', 'Интервалы'],
            ['degrees', 'Ступени'],
            ['triads', 'Мажор / минор'],
            ['naming', 'Имя ноты']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'chip active' : 'chip'}
            onClick={() => {
              setTab(id)
              setMessage('Нажмите «Слушать» или «Новый вопрос»')
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
            <button type="button" className="btn primary" onClick={() => void hearInterval()}>
              Слушать
            </button>
            <button type="button" className="btn" onClick={() => void newInterval()}>
              Новый вопрос
            </button>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {INTERVALS.map((item) => (
              <button
                key={item.name}
                type="button"
                className="chip"
                onClick={() =>
                  setMessage(
                    item.semitones === intervalRef.current
                      ? `Верно: ${item.name}. ${item.hint}`
                      : `Это не ${item.name}. Нажмите «Слушать» ещё раз.`
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
          <p>Гамма до мажор. Считайте: до ре ми фа соль ля си.</p>
          <div className="btn-row" style={{ marginLeft: 0 }}>
            <button type="button" className="btn primary" onClick={() => void hearDegree()}>
              Слушать
            </button>
            <button type="button" className="btn" onClick={() => void newDegree()}>
              Новый вопрос
            </button>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {DEGREES.map((label, idx) => (
              <button
                key={label}
                type="button"
                className="chip"
                onClick={() =>
                  setMessage(idx === degreeRef.current ? `Верно: ${label}` : `Не ${label}. Послушайте снова.`)
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
            <button type="button" className="btn primary" onClick={() => void hearTriad()}>
              Слушать
            </button>
            <button type="button" className="btn" onClick={() => void newTriad()}>
              Новый вопрос
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => setMessage(triadMajorRef.current ? 'Верно, это мажор' : 'Это минор')}
            >
              Мажор
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => setMessage(triadMajorRef.current ? 'Это мажор' : 'Верно, это минор')}
            >
              Минор
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'naming' ? (
        <div className="trainer-layout">
          <StaffNote midi={nameMidi} clef={nameMidi >= 60 ? 'treble' : 'bass'} reveal={false} />
          <div className="trainer-side">
            <button type="button" className="btn primary" onClick={() => void hearName()}>
              Слушать
            </button>
            <button type="button" className="btn" onClick={() => void newName()}>
              Новый вопрос
            </button>
            <button type="button" className="btn" onClick={() => setMessage(`Это ${midiToRu(nameRef.current)}`)}>
              Показать имя
            </button>
          </div>
        </div>
      ) : null}

      <PianoKeyboard
        fromMidi={range.fromMidi}
        toMidi={range.toMidi}
        activeMidis={flash}
        expectedMidis={tab === 'naming' ? [nameMidi] : flash}
        showNames={settings.showNoteNames}
        onNote={(midi) => {
          void ready().then((ok) => {
            if (!ok) return
            playNote(midi, 0.45)
            if (tab === 'naming') {
              setMessage(midi === nameRef.current ? `Верно: ${midiToRu(nameRef.current)}` : `Искали ${midiToRu(nameRef.current)}`)
            }
          })
        }}
      />
    </div>
  )
}
