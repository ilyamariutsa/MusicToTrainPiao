import type { Piece, PieceGroup } from '../types'
import { noteHand } from './theory'

export function estimateDifficulty(piece: Pick<Piece, 'notes' | 'tempo'>): PieceGroup {
  const notes = piece.notes
  if (notes.length === 0) return 'custom'

  const times = [...new Set(notes.map((n) => Math.round(n.time * 100) / 100))]
  let bothHands = 0
  for (const time of times) {
    const at = notes.filter((n) => Math.abs(n.time - time) < 0.03)
    if (at.some((n) => noteHand(n) === 'right') && at.some((n) => noteHand(n) === 'left')) bothHands += 1
  }

  const shortest = Math.min(...notes.map((n) => n.duration))
  const accidentals = notes.filter((n) => [1, 3, 6, 8, 10].includes(((n.midi % 12) + 12) % 12)).length
  const byClef = {
    treble: notes.filter((n) => noteHand(n) === 'right').sort((a, b) => a.time - b.time),
    bass: notes.filter((n) => noteHand(n) === 'left').sort((a, b) => a.time - b.time)
  }
  const maxJump = Math.max(jump(byClef.treble), jump(byClef.bass), 0)

  let score = 0
  if (notes.length > 64) score += 1
  if (notes.length > 160) score += 1
  if (piece.tempo > 108) score += 1
  if (bothHands > 6) score += 1
  if (shortest <= 0.26) score += 1
  if (accidentals / notes.length > 0.12) score += 1
  if (maxJump >= 7) score += 1
  if (times.length > 80) score += 1

  if (score <= 1) return 'beginner'
  if (score <= 3) return 'intermediate'
  return 'advanced'
}

function jump(notes: Piece['notes']): number {
  let max = 0
  for (let i = 1; i < notes.length; i += 1) {
    max = Math.max(max, Math.abs(notes[i].midi - notes[i - 1].midi))
  }
  return max
}

export function difficultyReason(piece: Pick<Piece, 'notes' | 'tempo'>, group: PieceGroup): string {
  const n = piece.notes.length
  if (group === 'beginner') return `Простая: ${n} нот, спокойный рисунок, удобно учить по одной ноте`
  if (group === 'intermediate') return `Средняя: ${n} нот, чаще две руки или более быстрые длительности`
  return `Сложная: ${n} нот, скачки, плотность или высокий темп`
}
