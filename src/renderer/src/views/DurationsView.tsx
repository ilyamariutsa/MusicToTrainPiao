import { useState } from 'react'
import { initAudio, playNote } from '../lib/audio'
import { PianoKeyboard } from '../components/PianoKeyboard'
import { useLibrary } from '../store'
import { KEYBOARD_PRESETS } from '../types'

const EXAMPLES: Array<{ beats: number; name: string; say: string; count: string }> = [
  { beats: 4, name: 'Целая', say: 'Звучит на все четыре счёта такта', count: '1 — 2 — 3 — 4' },
  { beats: 2, name: 'Половинная', say: 'Два счёта, вдвое короче целой', count: '1 — 2' },
  { beats: 1, name: 'Четверть', say: 'Один счёт. Самая частая длительность в простых пьесах', count: '1' },
  { beats: 0.5, name: 'Восьмая', say: 'Половина четверти. Две восьмые = одна четверть', count: 'и' },
  { beats: 0.25, name: 'Шестнадцатая', say: 'Ещё вдвое короче восьмой. Четыре штуки = четверть', count: 'ти' },
  { beats: 1.5, name: 'Четверть с точкой', say: 'Четверть плюс ещё половина её самой: полтора счёта', count: '1 — и' }
]

export function DurationsView() {
  const { settings } = useLibrary()
  const range = KEYBOARD_PRESETS[settings.keyCount]
  const [bpm, setBpm] = useState(80)
  const [active, setActive] = useState<number | null>(null)
  const [hold, setHold] = useState<Partial<Record<number, number>>>({})
  const [label, setLabel] = useState<Partial<Record<number, string>>>({})
  const [heard, setHeard] = useState<string>('Выберите длительность — нота прозвучит ровно столько')

  async function hear(beats: number, name: string, midi = 60) {
    await initAudio()
    const ms = (beats * 60 * 1000) / bpm
    setActive(midi)
    setHold({ [midi]: ms })
    setLabel({ [midi]: name })
    setHeard(`${name} при ${bpm} BPM звучит ${(ms / 1000).toFixed(1)} сек. Слушайте до конца полоски на клавише.`)
    playNote(midi, ms / 1000, 0.85)
    window.setTimeout(() => {
      setActive(null)
      setHold({})
    }, ms + 40)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Длительности</p>
          <h1>Сколько нота должна звучать</h1>
          <p className="lead">
            Нажмите карточку — услышите длительность на «до первой». Полоска на клавише тает ровно столько, сколько
            нужно держать палец. Темп можно замедлить, как на занятии.
          </p>
        </div>
        <label className="tempo">
          Темп {bpm} BPM
          <input type="range" min={50} max={140} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
        </label>
      </header>

      <div className="piece-grid">
        {EXAMPLES.map((item) => (
          <article key={item.name} className="piece-card">
            <span className="tag">{item.beats} доли</span>
            <h3>{item.name}</h3>
            <p>{item.say}</p>
            <p className="meta">Счёт: {item.count}</p>
            <div className="piece-actions">
              <button type="button" className="btn primary" onClick={() => void hear(item.beats, item.name)}>
                Слушать
              </button>
            </div>
          </article>
        ))}
      </div>

      <p className="now-playing">{heard}</p>
      <PianoKeyboard
        fromMidi={range.fromMidi}
        toMidi={range.toMidi}
        activeMidis={active != null ? [active] : []}
        expectedMidis={active != null ? [active] : [60]}
        holdMs={hold}
        showNames={settings.showNoteNames}
        onNote={(midi) => {
          const current = EXAMPLES.find((e) => label[60] === e.name) ?? EXAMPLES[2]
          void hear(current.beats, current.name, midi)
        }}
      />
      <p className="hint">
        Нажмите любую клавишу, чтобы сравнить ту же длительность в другом месте клавиатуры. До первой подсвечена как
        ориентир.
      </p>
    </div>
  )
}
