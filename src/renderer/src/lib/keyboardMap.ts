/** Компьютерная клавиатура как одна октава + соседние ноты, начиная с C3/C4. */
export const KEY_TO_MIDI: Record<string, number> = {
  KeyZ: 48,
  KeyS: 49,
  KeyX: 50,
  KeyD: 51,
  KeyC: 52,
  KeyV: 53,
  KeyG: 54,
  KeyB: 55,
  KeyH: 56,
  KeyN: 57,
  KeyJ: 58,
  KeyM: 59,
  Comma: 60,
  KeyQ: 60,
  Digit2: 61,
  KeyW: 62,
  Digit3: 63,
  KeyE: 64,
  KeyR: 65,
  Digit5: 66,
  KeyT: 67,
  Digit6: 68,
  KeyY: 69,
  Digit7: 70,
  KeyU: 71,
  KeyI: 72,
  Digit9: 73,
  KeyO: 74,
  Digit0: 75,
  KeyP: 76
}

export function midiFromKeyboardEvent(event: KeyboardEvent): number | null {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null
  return KEY_TO_MIDI[event.code] ?? null
}
