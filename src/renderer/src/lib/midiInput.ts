export type MidiNoteHandler = (midi: number, velocity: number, on: boolean) => void

export async function listMidiInputs(): Promise<Array<{ id: string; name: string }>> {
  if (!navigator.requestMIDIAccess) return []
  try {
    const access = await navigator.requestMIDIAccess()
    return [...access.inputs.values()].map((input) => ({
      id: input.id ?? input.name ?? 'midi',
      name: input.name ?? 'MIDI-клавиатура'
    }))
  } catch {
    return []
  }
}

/**
 * Listens to every MIDI keyboard, including ones plugged in or switched on later.
 * Returns the unsubscribe at once, so a screen left before MIDI access is granted
 * still detaches (otherwise every note would keep playing twice on later screens).
 */
export function subscribeMidi(handler: MidiNoteHandler): () => void {
  if (!navigator.requestMIDIAccess) return () => undefined
  let stopped = false
  let detach = (): void => undefined
  const onMessage = (event: MIDIMessageEvent): void => {
    const data = event.data
    if (stopped || !data || data.length < 3) return
    const status = data[0] & 0xf0
    const midi = data[1]
    const velocity = data[2]
    if (status === 0x90 && velocity > 0) handler(midi, velocity / 127, true)
    else if (status === 0x80 || (status === 0x90 && velocity === 0)) handler(midi, 0, false)
  }
  navigator
    .requestMIDIAccess()
    .then((access) => {
      if (stopped) return
      const attached = new Set<MIDIInput>()
      const attachAll = (): void => {
        for (const input of access.inputs.values()) {
          if (attached.has(input) || input.state === 'disconnected') continue
          input.addEventListener('midimessage', onMessage as EventListener)
          attached.add(input)
        }
      }
      attachAll()
      access.addEventListener('statechange', attachAll)
      detach = () => {
        access.removeEventListener('statechange', attachAll)
        for (const input of attached) input.removeEventListener('midimessage', onMessage as EventListener)
        attached.clear()
      }
    })
    .catch(() => {
      /* no MIDI access: the computer keyboard and the mouse still work */
    })
  return () => {
    stopped = true
    detach()
  }
}
