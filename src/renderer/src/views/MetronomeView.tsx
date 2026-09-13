import { useEffect, useRef, useState } from 'react'
import { initAudio, Tone } from '../lib/audio'

export function MetronomeView() {
  const [bpm, setBpm] = useState(92)
  const [beats, setBeats] = useState(4)
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState(0)
  const click = useRef<Tone.MembraneSynth | null>(null)

  useEffect(() => {
    return () => {
      Tone.getTransport().stop()
      Tone.getTransport().cancel()
    }
  }, [])

  async function start() {
    await initAudio()
    if (!click.current) {
      click.current = new Tone.MembraneSynth({
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 }
      }).toDestination()
      click.current.volume.value = -10
    }
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()
    transport.bpm.value = bpm
    let i = 0
    transport.scheduleRepeat((time) => {
      const accent = i % beats === 0
      click.current?.triggerAttackRelease(accent ? 'C4' : 'G3', 0.05, time)
      Tone.getDraw().schedule(() => setBeat(i % beats), time)
      i += 1
    }, '4n')
    transport.start()
    setRunning(true)
  }

  function stop() {
    Tone.getTransport().stop()
    Tone.getTransport().cancel()
    setRunning(false)
    setBeat(0)
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
            <span key={i} className={running && i === beat ? 'pulse on' : 'pulse'} />
          ))}
        </div>
        <strong className="metro-bpm">{bpm}</strong>
        <input type="range" min={40} max={208} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
        <label>
          Долей в такте
          <select
            value={beats}
            onChange={(e) => {
              setBeats(Number(e.target.value))
              if (running) {
                stop()
              }
            }}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={6}>6</option>
          </select>
        </label>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => void start()} disabled={running}>
            Старт
          </button>
          <button type="button" className="btn ghost" onClick={stop}>
            Стоп
          </button>
        </div>
      </div>
    </div>
  )
}
