import { useEffect, useRef } from 'react'
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import { midiToRu, midiToVexKey } from '../lib/theory'
import type { Clef } from '../types'

type Props = {
  midi: number
  clef: Clef
  reveal?: boolean
}

export function StaffNote({ midi, clef, reveal = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    host.innerHTML = ''
    const renderer = new Renderer(host, Renderer.Backends.SVG)
    renderer.resize(260, 170)
    const ctx = renderer.getContext()
    const stave = new Stave(16, 24, 220)
    stave.addClef(clef).setContext(ctx).draw()
    const { key, accidental } = midiToVexKey(midi)
    const note = new StaveNote({ clef, keys: [key], duration: 'q' })
    if (accidental) note.addModifier(new Accidental(accidental), 0)
    note.setStyle({ fillStyle: '#c4784a', strokeStyle: '#c4784a' })
    const voice = new Voice({ numBeats: 4, beatValue: 4 }).setStrict(false)
    voice.addTickables([note])
    new Formatter().joinVoices([voice]).format([voice], 160)
    voice.draw(ctx, stave)
  }, [midi, clef])

  return (
    <div className="staff-card">
      <div className="staff-card-clef">{clef === 'treble' ? 'Скрипичный ключ' : 'Басовый ключ'}</div>
      <div ref={ref} />
      <div className="staff-card-name">{reveal ? midiToRu(midi) : 'Какая это нота?'}</div>
    </div>
  )
}
