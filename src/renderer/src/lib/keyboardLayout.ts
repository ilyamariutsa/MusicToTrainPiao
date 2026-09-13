export const WHITE_PC = [0, 2, 4, 5, 7, 9, 11]

export function isWhitePc(midi: number): boolean {
  return WHITE_PC.includes(((midi % 12) + 12) % 12)
}

export function whiteKeys(fromMidi: number, toMidi: number): number[] {
  const keys: number[] = []
  for (let midi = fromMidi; midi <= toMidi; midi += 1) {
    if (isWhitePc(midi)) keys.push(midi)
  }
  return keys
}

export function blackKeys(fromMidi: number, toMidi: number): number[] {
  const keys: number[] = []
  for (let midi = fromMidi; midi <= toMidi; midi += 1) {
    if (!isWhitePc(midi)) keys.push(midi)
  }
  return keys
}

/** Horizontal center of a key, in percent of the keyboard width. */
export function keyCenterPercent(midi: number, fromMidi: number, toMidi: number): number {
  const whites = whiteKeys(fromMidi, toMidi)
  const whiteWidth = 100 / Math.max(1, whites.length)
  if (isWhitePc(midi)) {
    const index = whites.indexOf(midi)
    if (index < 0) return 50
    return (index + 0.5) * whiteWidth
  }
  const leftWhite = whites.indexOf(midi - 1)
  if (leftWhite < 0) return 50
  return (leftWhite + 1) * whiteWidth
}
