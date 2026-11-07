export type Clef = 'treble' | 'bass'
export type Hand = 'right' | 'left' | 'both'
export type PieceGroup = 'beginner' | 'intermediate' | 'advanced' | 'warmup' | 'custom'
export type PieceSource = 'builtin' | 'imported'

export type Finger = 1 | 2 | 3 | 4 | 5

export interface ScoreNote {
  id: string
  midi: number
  duration: number
  time: number
  clef: Clef
  /** Grand-staff position: 1 upper, 2 lower. Independent of the written clef. */
  staff?: 1 | 2
  voice?: number
  finger?: Finger
  /**
   * Tied from the previous note of the same pitch: it keeps that note sounding.
   * Not struck again when played, not asked for in practice.
   */
  tied?: boolean
  /** Loudness 0–1 from the score's dynamics or the MIDI file. */
  velocity?: number
  /** How the score spells it (letter and alteration), e.g. F + 1 = F♯ even in a flat key. */
  step?: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
  alter?: number
}

export interface ScoreBar {
  start: number
  end: number
  signature: [number, number]
  number: number
  /** Key signature from this bar on (circle of fifths), when the piece changes key. */
  key?: number
}

export interface Piece {
  id: string
  title: string
  composer: string
  source: PieceSource
  group: PieceGroup
  favorite: boolean
  timeSignature: [number, number]
  /** Circle-of-fifths: -7..7 */
  keySignature: number
  /** Minor pieces share the signature of their relative major (A minor = 0). */
  mode?: 'major' | 'minor'
  tempo: number
  notes: ScoreNote[]
  /** One entry per measure, including meter changes. */
  bars?: ScoreBar[]
  /** Sustain pedal held down, as [from, to] in beats. */
  pedal?: Array<[number, number]>
  createdAt: string
  lastPracticedAt?: string
  practiceSeconds: number
  bestAccuracy?: number
}

export interface AppStats {
  totalPracticeSeconds: number
  trainerCorrect: number
  trainerTotal: number
  streakDays: number
  lastPracticeDate: string | null
  warmupSessions: number
}

export type ViewId =
  | 'home'
  | 'library'
  | 'practice'
  | 'trainer'
  | 'durations'
  | 'solfege'
  | 'warmup'
  | 'metronome'
  | 'settings'

export type KeyCount = 61 | 76 | 88

export interface AppSettings {
  keyCount: KeyCount
  showNoteNames: boolean
  showRuNames: boolean
  showStaffGuide: boolean
  beginnerMode: boolean
  sidebarCollapsed: boolean
  /** Master volume, 0–100 %. */
  volume: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  keyCount: 76,
  showNoteNames: true,
  showRuNames: true,
  showStaffGuide: true,
  beginnerMode: true,
  sidebarCollapsed: false,
  volume: 80
}

/** Typical digital-piano ranges, inclusive MIDI numbers. */
export const KEYBOARD_PRESETS: Record<KeyCount, { fromMidi: number; toMidi: number; label: string; hint: string }> = {
  61: { fromMidi: 36, toMidi: 96, label: '61 клавиша', hint: 'До большой — до 4-й октавы' },
  76: { fromMidi: 28, toMidi: 103, label: '76 клавиш', hint: 'Как у большинства цифровых пианино: ми контроктавы — соль 4-й' },
  88: { fromMidi: 21, toMidi: 108, label: '88 клавиш', hint: 'Полный концертный диапазон' }
}

export const GROUP_LABELS: Record<PieceGroup, string> = {
  beginner: 'Простые',
  intermediate: 'Средние',
  advanced: 'Сложные',
  warmup: 'Разминка',
  custom: 'Мои'
}

export const GROUP_HINTS: Record<PieceGroup, string> = {
  beginner: 'Короткие знакомые мелодии, удобно для первых месяцев',
  intermediate: 'Две руки и более длинные фразы',
  advanced: 'Плотная фактура, скачки, быстрее темп',
  warmup: 'Гаммы, арпеджио и пальцевые упражнения',
  custom: 'Всё, что вы импортировали сами'
}
