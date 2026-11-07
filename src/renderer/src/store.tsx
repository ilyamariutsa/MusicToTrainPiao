import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadPiano, setMasterVolume } from './lib/audio'
import { assignFingering } from './lib/fingering'
import { importPickedFile } from './lib/importFiles'
import { BUILTIN_PIECES, WARMUPS } from './lib/pieces'
import type { AppSettings, AppStats, Piece } from './types'
import { DEFAULT_SETTINGS } from './types'

/** A file chosen in the dialog or dropped on the window; `error` when it could not be read. */
export type PickedFile = { name: string; ext: string; base64: string; error?: string }

type LibraryState = {
  pieces: Piece[]
  stats: AppStats
  settings: AppSettings
  ready: boolean
  error: string | null
  savePiece: (piece: Piece) => Promise<void>
  updatePiece: (id: string, patch: Partial<Piece>) => Promise<void>
  deletePiece: (id: string) => Promise<void>
  importFromDisk: () => Promise<Piece[]>
  importFiles: (files: PickedFile[]) => Promise<Piece[]>
  touchPractice: (id: string, seconds: number, accuracy?: number) => Promise<void>
  recordTrainer: (correct: boolean) => Promise<void>
  recordWarmup: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  clearError: () => void
}

const FALLBACK_STATS: AppStats = {
  totalPracticeSeconds: 0,
  trainerCorrect: 0,
  trainerTotal: 0,
  streakDays: 0,
  lastPracticeDate: null,
  warmupSessions: 0
}

const LibraryContext = createContext<LibraryState | null>(null)

function hasDesktopApi(): boolean {
  return typeof window !== 'undefined' && Boolean(window.notamentor)
}

/** Built-in pieces and warm-ups come from the code; only the user's progress on them is stored. */
function mergePieces(saved: Piece[]): Piece[] {
  const imported = saved
    .filter((p) => p && p.source === 'imported' && Array.isArray(p.notes))
    .map((p) => {
      try {
        assignFingering(p.notes, { overwrite: false })
      } catch {
        /* a piece with odd data still opens, just without suggested fingers */
      }
      return p
    })
  const builtins = [...BUILTIN_PIECES, ...WARMUPS].map((b) => {
    const prev = saved.find((p) => p && p.id === b.id)
    if (!prev) return b
    return {
      ...b,
      favorite: prev.favorite,
      group: prev.group === 'custom' ? b.group : prev.group,
      lastPracticedAt: prev.lastPracticedAt,
      practiceSeconds: prev.practiceSeconds ?? 0,
      bestAccuracy: prev.bestAccuracy
    }
  })
  return [...builtins, ...imported]
}

/** The user's local calendar day (a UTC date would roll over at 03:00 in Moscow). */
function localDay(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function withStreak(stats: AppStats): AppStats {
  const day = localDay()
  if (stats.lastPracticeDate === day) return stats
  return {
    ...stats,
    lastPracticeDate: day,
    streakDays: stats.lastPracticeDate === localDay(-1) ? stats.streakDays + 1 : 1
  }
}

/** The streak as it stands today: it is broken once a whole day has passed without practice. */
export function currentStreak(stats: AppStats): number {
  return stats.lastPracticeDate === localDay() || stats.lastPracticeDate === localDay(-1) ? stats.streakDays : 0
}

/** Pieces with fewer attempts say nothing about accuracy (one right note is not "100 %"). */
export const MIN_ATTEMPTS_FOR_ACCURACY = 10

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [pieces, setPieces] = useState<Piece[]>([])
  const [stats, setStats] = useState<AppStats>(FALLBACK_STATS)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mutators read the latest data from refs, not from render closures: screens keep
  // callbacks in effects and unmount cleanups, and a stale copy would overwrite newer changes.
  const piecesRef = useRef<Piece[]>([])
  const statsRef = useRef<AppStats>(FALLBACK_STATS)
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS)
  // If the library could not be read, nothing is written back: saving the built-ins
  // alone would overwrite the user's file (and then its backup).
  const writable = useRef(false)
  const settingsTimer = useRef<number | null>(null)

  /** Writes to disk; a failure is shown to the user instead of vanishing. */
  const write = useCallback(async (what: string, save: () => Promise<unknown> | void) => {
    if (!writable.current) return
    try {
      await save()
    } catch (err) {
      setError(`Не удалось сохранить ${what}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const persistPieces = useCallback(
    async (next: Piece[]) => {
      piecesRef.current = next
      setPieces(next)
      await write('библиотеку', () =>
        hasDesktopApi()
          ? window.notamentor.saveLibrary({ pieces: next })
          : localStorage.setItem('notamentor.library', JSON.stringify({ pieces: next }))
      )
    },
    [write]
  )

  const persistStats = useCallback(
    async (next: AppStats) => {
      statsRef.current = next
      setStats(next)
      await write('статистику', () =>
        hasDesktopApi() ? window.notamentor.saveStats(next) : localStorage.setItem('notamentor.stats', JSON.stringify(next))
      )
    },
    [write]
  )

  const flushSettings = useCallback(() => {
    if (settingsTimer.current == null) return
    window.clearTimeout(settingsTimer.current)
    settingsTimer.current = null
    const next = settingsRef.current
    void write('настройки', () =>
      hasDesktopApi() ? window.notamentor.saveSettings(next) : localStorage.setItem('notamentor.settings', JSON.stringify(next))
    )
  }, [write])

  // Settings apply at once; the file is written when a slider stops moving, not on every step.
  const persistSettings = useCallback(
    async (next: AppSettings) => {
      settingsRef.current = next
      setSettings(next)
      setMasterVolume(next.volume)
      if (settingsTimer.current != null) window.clearTimeout(settingsTimer.current)
      settingsTimer.current = window.setTimeout(flushSettings, 400)
    },
    [flushSettings]
  )

  useEffect(() => {
    window.addEventListener('beforeunload', flushSettings)
    return () => window.removeEventListener('beforeunload', flushSettings)
  }, [flushSettings])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = hasDesktopApi()
          ? await window.notamentor.listLibrary()
          : JSON.parse(localStorage.getItem('notamentor.library') || '{"pieces":[]}')
        const saved = (Array.isArray(raw?.pieces) ? raw.pieces : []) as Piece[]
        const next = mergePieces(saved)
        const loadedStats = hasDesktopApi()
          ? ((await window.notamentor.getStats()) as AppStats)
          : ({ ...FALLBACK_STATS, ...JSON.parse(localStorage.getItem('notamentor.stats') || '{}') } as AppStats)
        const loadedSettings = hasDesktopApi()
          ? ((await window.notamentor.getSettings()) as AppSettings)
          : ({ ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('notamentor.settings') || '{}') } as AppSettings)
        if (cancelled) return
        const nextStats = { ...FALLBACK_STATS, ...loadedStats }
        const nextSettings = { ...DEFAULT_SETTINGS, ...loadedSettings }
        piecesRef.current = next
        statsRef.current = nextStats
        settingsRef.current = nextSettings
        setPieces(next)
        setStats(nextStats)
        setSettings(nextSettings)
        setMasterVolume(nextSettings.volume)
        // Decode the piano samples in the background so the first key already sounds right.
        loadPiano()
        writable.current = true
        if (hasDesktopApi()) await write('библиотеку', () => window.notamentor.saveLibrary({ pieces: next }))
      } catch (err) {
        if (!cancelled) {
          piecesRef.current = mergePieces([])
          setPieces(piecesRef.current)
          setError(
            `Библиотека не открылась (${err instanceof Error ? err.message : String(err)}). ` +
              'Чтобы не затереть её файл, изменения сейчас не сохраняются — перезапустите программу.'
          )
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const savePiece = useCallback(
    async (piece: Piece) => {
      const next = [...piecesRef.current.filter((p) => p.id !== piece.id), piece]
      await persistPieces(next)
    },
    [persistPieces]
  )

  const updatePiece = useCallback(
    async (id: string, patch: Partial<Piece>) => {
      await persistPieces(piecesRef.current.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    },
    [persistPieces]
  )

  const deletePiece = useCallback(
    async (id: string) => {
      const target = piecesRef.current.find((p) => p.id === id)
      if (!target || target.source === 'builtin') return
      await persistPieces(piecesRef.current.filter((p) => p.id !== id))
    },
    [persistPieces]
  )

  /** Imports files from the dialog or dropped on the window; every failure is listed, not only the last. */
  const importFiles = useCallback(
    async (files: PickedFile[]) => {
      const imported: Piece[] = []
      const failed: string[] = []
      for (const file of files) {
        if (file.error) {
          failed.push(`${file.name}: ${file.error}`)
          continue
        }
        try {
          imported.push(await importPickedFile(file))
        } catch (err) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : 'не удалось прочитать'}`)
        }
      }
      if (failed.length) setError(`Не импортировано — ${failed.join('; ')}`)
      if (imported.length) await persistPieces([...piecesRef.current, ...imported])
      return imported
    },
    [persistPieces]
  )

  const importFromDisk = useCallback(async () => {
    if (!hasDesktopApi()) {
      setError('Импорт файлов доступен в установленном приложении')
      return []
    }
    try {
      return await importFiles(await window.notamentor.pickImport())
    } catch (err) {
      setError(`Не удалось открыть файлы: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }
  }, [importFiles])

  /** Adds practice time (and, when there were enough attempts, the accuracy) to a piece and the day. */
  const touchPractice = useCallback(
    async (id: string, seconds: number, accuracy?: number) => {
      if (seconds <= 0 && accuracy == null) return
      const nextPieces = piecesRef.current.map((p) =>
        p.id === id
          ? {
              ...p,
              practiceSeconds: (p.practiceSeconds ?? 0) + seconds,
              lastPracticedAt: new Date().toISOString(),
              bestAccuracy:
                accuracy == null ? p.bestAccuracy : Math.max(p.bestAccuracy ?? 0, Math.round(accuracy))
            }
          : p
      )
      await persistPieces(nextPieces)
      if (seconds <= 0) return
      const stats = statsRef.current
      await persistStats({
        ...withStreak(stats),
        totalPracticeSeconds: stats.totalPracticeSeconds + seconds
      })
    },
    [persistPieces, persistStats]
  )

  const recordTrainer = useCallback(
    async (correct: boolean) => {
      const stats = statsRef.current
      await persistStats({
        ...withStreak(stats),
        trainerTotal: stats.trainerTotal + 1,
        trainerCorrect: stats.trainerCorrect + (correct ? 1 : 0)
      })
    },
    [persistStats]
  )

  const recordWarmup = useCallback(async () => {
    const stats = statsRef.current
    await persistStats({
      ...withStreak(stats),
      warmupSessions: stats.warmupSessions + 1
    })
  }, [persistStats])

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      await persistSettings({ ...settingsRef.current, ...patch })
    },
    [persistSettings]
  )

  const value = useMemo<LibraryState>(
    () => ({
      pieces,
      stats,
      settings,
      ready,
      error,
      savePiece,
      updatePiece,
      deletePiece,
      importFromDisk,
      importFiles,
      touchPractice,
      recordTrainer,
      recordWarmup,
      updateSettings,
      clearError: () => setError(null)
    }),
    [
      pieces,
      stats,
      settings,
      ready,
      error,
      savePiece,
      updatePiece,
      deletePiece,
      importFromDisk,
      importFiles,
      touchPractice,
      recordTrainer,
      recordWarmup,
      updateSettings
    ]
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary(): LibraryState {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary вне LibraryProvider')
  return ctx
}
