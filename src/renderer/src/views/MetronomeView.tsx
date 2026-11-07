import { useEffect, useRef, useState } from 'react'
import { initAudio, playClick, Tone } from '../lib/audio'

const BPM_MIN = 40
const BPM_MAX = 208

export function MetronomeView() {
  const [bpm, setBpm] = useState(92)
  const [beats, setBeats] = useState(4)
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState(0)
  const beatsRef = useRef(beats)
  beatsRef.current = beats
  const taps = useRef<number[]>([])

  useEffect(() => {
    return () => {
      Tone.getTransport().stop()
      Tone.getTransport().cancel()
    }
  }, [])

  // Tempo follows the slider while it plays.
  useEffect(() => {
    Tone.getTransport().bpm.value = bpm
  }, [bpm])

  async function start() {
    await initAudio()
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()
    transport.position = 0
    transport.bpm.value = bpm
    let count = 0
    transport.scheduleRepeat((time) => {
      // Beats per bar are read on every click, so changing them does not need a restart.
      const n = count % beatsRef.current
      count += 1
      playClick(n === 0, time)
      Tone.getDraw().schedule(() => setBeat(n), time)
    }, '4n')
    transport.start('+0.05')
    setRunning(true)
  }

  function stop() {
    Tone.getTransport().stop()
    Tone.getTransport().cancel()
    setRunning(false)
    setBeat(0)
  }

  /** Tap the beat a few times: the tempo becomes the average of the last taps. */
  function tap() {
    const now = performance.now()
    const recent = [...taps.current.filter((t) => now - t < 2500), now].slice(-6)
    taps.current = recent
    if (recent.length < 2) return
    const gaps = recent.slice(1).map((t, i) => t - recent[i])
    const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
    setBpm(Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(60000 / average))))
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Метроном</p>
          <h1>Ровная пульсация без телефона на пюпитре</h1>
          <p className="lead">Отдельно от пьесы — когда разбираете аппликатуру или играете гаммы вслух.</p>
        </div>
      </header>
      <div className="metronome">
        <div className="metro-beats">
          {Array.from({ length: beats }, (_, i) => (
            <span key={i} className={running && i === beat ? (i === 0 ? 'pulse on accent' : 'pulse on') : 'pulse'} />
          ))}
        </div>
        <strong className="metro-bpm">{bpm}</strong>
        <div className="metro-row">
          <button type="button" className="btn icon" onClick={() => setBpm((v) => Math.max(BPM_MIN, v - 1))} aria-label="Медленнее">
            −
          </button>
          <input
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            aria-label="Темп, ударов в минуту"
          />
          <button type="button" className="btn icon" onClick={() => setBpm((v) => Math.min(BPM_MAX, v + 1))} aria-label="Быстрее">
            +
          </button>
        </div>
        <label>
          Долей в такте
          <select value={beats} onChange={(e) => setBeats(Number(e.target.value))}>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={6}>6</option>
          </select>
        </label>
        <div className="btn-row">
          <button type="button" className="btn" onClick={tap} title="Простучите темп несколько раз">
            Простучать темп
          </button>
          {running ? (
            <button type="button" className="btn primary" onClick={stop}>
              Стоп
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => void start()}>
              Старт
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
