/** Diatonic step of C, C#, D, D#, E, F, F#, G, G#, A, A#, B. */
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]

/** Distance between adjacent staff lines (px). */
export const SPACE = 12
export const STEP = SPACE / 2
/** VexFlow odd-width strokes sit on the half-pixel. */
export const LINE_SNAP = 0.5
/** Extra width past the outermost note of a ledger fragment. */
export const LEDGER_PAD = SPACE * 1.15

/**
 * SMuFL engraving font bundled with VexFlow. 1 em = 4 staff spaces, and every glyph
 * is drawn so that its origin (alphabetic baseline) sits exactly on its pitch:
 * a notehead is centred on it, a sharp too, a flat has its bowl there, a G clef curls
 * around the G line. No font-metric guessing is needed to place them.
 */
export const MUSIC_FONT = 'Bravura'
export const MUSIC_EM = SPACE * 4
export const GLYPH = {
  gClef: '',
  fClef: '',
  noteheadWhole: '',
  sharp: '',
  flat: ''
} as const
/** SMuFL engravingDefaults.legerLineExtension, in staff spaces. */
export const LEDGER_EXTENSION = 0.4

/** Room for brace + clefs; piano is indented by the same amount. */
export const STAFF_GUTTER = 92

/**
 * Diatonic index: C0 = 0, D0 = 1, … C4 = 28, E4 = 30, F5 = 38, A3 = 26, G2 = 18.
 * Sharps share the lower letter, flats the upper (C# = C, Db = D).
 */
export function diatonicIndex(midi: number): number {
  const octave = Math.floor(midi / 12) - 1
  return octave * 7 + LETTER[((midi % 12) + 12) % 12]
}

/** Treble: E4 G4 B4 D5 F5. Bass: G2 B2 D3 F3 A3. Middle C = 28. */
export const TREBLE_TOP = 38
export const TREBLE_BOTTOM = 30
export const BASS_TOP = 26
export const BASS_BOTTOM = 18
export const MIDDLE_C = 28

export type StaffLayout = {
  height: number
  trebleTopY: number
  trebleBottomY: number
  bassTopY: number
  bassBottomY: number
  yOf: (index: number) => number
}

export function layoutStaff(fromMidi: number, toMidi: number): StaffLayout {
  const hi = diatonicIndex(toMidi)
  const lo = diatonicIndex(fromMidi)
  const extraTop = Math.max(0, hi - TREBLE_TOP) * STEP
  const padTop = 28
  const padBot = 22
  const trebleTopY = padTop + extraTop
  const yOf = (index: number): number => trebleTopY + (TREBLE_TOP - index) * STEP
  const lowestY = yOf(Math.min(lo, BASS_BOTTOM))
  return {
    height: Math.ceil(lowestY + padBot),
    trebleTopY,
    trebleBottomY: yOf(TREBLE_BOTTOM),
    bassTopY: yOf(BASS_TOP),
    bassBottomY: yOf(BASS_BOTTOM),
    yOf
  }
}

/** Ledger line indices between the staff and the note, inclusive if the note is on a line. */
export function ledgerIndices(index: number): number[] {
  const lines: number[] = []
  if (index >= MIDDLE_C) {
    if (index === MIDDLE_C) return [MIDDLE_C]
    for (let line = TREBLE_TOP + 2; line <= index; line += 2) lines.push(line)
    return lines
  }
  for (let line = BASS_BOTTOM - 2; line >= index; line -= 2) lines.push(line)
  return lines
}

export type LedgerSpan = {
  index: number
  left: number
  right: number
}

/**
 * One ledger per pitch, spanning the whole fragment of notes that need it.
 * Closer to the staff the span is wider — a pyramid of extra lines.
 */
export function pyramidLedgers(
  items: Array<{ x: number; index: number }>,
  pad = LEDGER_PAD
): LedgerSpan[] {
  const groups = new Map<number, number[]>()
  for (const item of items) {
    for (const line of ledgerIndices(item.index)) {
      const xs = groups.get(line)
      if (xs) xs.push(item.x)
      else groups.set(line, [item.x])
    }
  }
  return [...groups.entries()]
    .map(([index, xs]) => ({
      index,
      left: Math.min(...xs) - pad,
      right: Math.max(...xs) + pad
    }))
    .sort((a, b) => b.index - a.index)
}

export function assertGrandStaffGeometry(layout: StaffLayout): void {
  const { yOf, trebleTopY, trebleBottomY, bassTopY, bassBottomY } = layout
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01
  if (!near(yOf(TREBLE_TOP), trebleTopY)) throw new Error('F5 must sit on the top treble line')
  if (!near(yOf(TREBLE_BOTTOM), trebleBottomY)) throw new Error('E4 must sit on the bottom treble line')
  if (!near(trebleBottomY - trebleTopY, 4 * SPACE)) throw new Error('Treble must be 4 spaces tall')
  if (!near(yOf(BASS_TOP), bassTopY)) throw new Error('A3 must sit on the top bass line')
  if (!near(yOf(BASS_BOTTOM), bassBottomY)) throw new Error('G2 must sit on the bottom bass line')
  if (!near(bassTopY - trebleBottomY, 2 * SPACE)) throw new Error('Gap E4–A3 must be 2 spaces (C4 in the middle)')
  if (!near(yOf(MIDDLE_C) - trebleBottomY, SPACE)) throw new Error('C4 must be one space below E4')
  if (!near(bassTopY - yOf(MIDDLE_C), SPACE)) throw new Error('C4 must be one space above A3')
  if (ledgerIndices(MIDDLE_C).join() !== String(MIDDLE_C)) throw new Error('C4 needs one ledger')
  if (ledgerIndices(30).length !== 0) throw new Error('E4 needs no ledger')
  if (ledgerIndices(14).join() !== '16,14') throw new Error('C2 needs ledgers E2 and C2')
  if (ledgerIndices(48).join() !== '40,42,44,46,48') throw new Error('B6 needs five ledgers')
  const low = pyramidLedgers(
    [
      { x: 0, index: 14 },
      { x: 10, index: 15 },
      { x: 20, index: 16 },
      { x: 30, index: 18 }
    ],
    2
  )
  if (low.length !== 2) throw new Error('Bass pyramid must be E2 then C2')
  if (low[0].index !== 16 || low[0].left !== -2 || low[0].right !== 22) {
    throw new Error('E2 ledger must span C2–E2')
  }
  if (low[1].index !== 14 || low[1].left !== -2 || low[1].right !== 2) {
    throw new Error('C2 ledger must span only C2')
  }
  const high = pyramidLedgers(
    [
      { x: 100, index: 38 },
      { x: 110, index: 40 },
      { x: 120, index: 41 },
      { x: 130, index: 48 }
    ],
    2
  )
  const a5 = high.find((span) => span.index === 40)
  const b6 = high.find((span) => span.index === 48)
  if (!a5 || a5.left !== 108 || a5.right !== 132) throw new Error('A5 ledger must span A5–B6')
  if (!b6 || b6.left !== 128 || b6.right !== 132) throw new Error('B6 ledger must be the narrow top')
  if (high.some((span) => span.index === 38)) throw new Error('F5 is a staff line, not a ledger')
}
