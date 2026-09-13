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

export async function subscribeMidi(handler: MidiNoteHandler): Promise<() => void> {
  if (!navigator.requestMIDIAccess) return () => undefined
  const access = await navigator.requestMIDIAccess()
  const onMessage = (event: MIDIMessageEvent): void => {
    const data = event.data
    if (!data || data.length < 3) return
    const status = data[0] & 0xf0
    const midi = data[1]
    const velocity = data[2]
    if (status === 0x90 && velocity > 0) handler(midi, velocity / 127, true)
    else if (status === 0x80 || (status === 0x90 && velocity === 0)) handler(midi, 0, false)
  }
  for (const input of access.inputs.values()) {
    input.addEventListener('midimessage', onMessage as EventListener)
  }
  return () => {
    for (const input of access.inputs.values()) {
      input.removeEventListener('midimessage', onMessage as EventListener)
    }
  }
}
