import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadPiano, setMasterVolume } from './lib/audio'
import { assignFingering } from './lib/fingering'
import { importPickedFile } from './lib/importFiles'
import { BUILTIN_PIECES } from './lib/pieces'
import type { AppSettings, AppStats, Piece } from './types'
import { DEFAULT_SETTINGS } from './types'

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

function mergePieces(saved: Piece[]): Piece[] {
  const imported = saved
    .filter((p) => p.source === 'imported')
    .map((p) => {
      assignFingering(p.notes, { overwrite: false })
      return p
    })
  const builtins = BUILTIN_PIECES.map((b) => {
    const prev = saved.find((p) => p.id === b.id)
    if (!prev) return b
    return {
      ...b,
      favorite: prev.favorite,
      group: prev.group === 'custom' ? b.group : prev.group,
      lastPracticedAt: prev.lastPracticedAt,
      practiceSeconds: prev.practiceSeconds,
      bestAccuracy: prev.bestAccuracy
    }
  })
  return [...builtins, ...imported]
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function withStreak(stats: AppStats): AppStats {
  const day = today()
  if (stats.lastPracticeDate === day) return stats
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const ymd = yesterday.toISOString().slice(0, 10)
  return {
    ...stats,
    lastPracticeDate: day,
    streakDays: stats.lastPracticeDate === ymd ? stats.streakDays + 1 : 1
  }
}

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

  const persistPieces = useCallback(async (next: Piece[]) => {
    piecesRef.current = next
    setPieces(next)
    if (hasDesktopApi()) {
      await window.notamentor.saveLibrary({ pieces: next })
    } else {
      localStorage.setItem('notamentor.library', JSON.stringify({ pieces: next }))
    }
  }, [])

  const persistStats = useCallback(async (next: AppStats) => {
    statsRef.current = next
    setStats(next)
    if (hasDesktopApi()) {
      await window.notamentor.saveStats(next)
    } else {
      localStorage.setItem('notamentor.stats', JSON.stringify(next))
    }
  }, [])

  const persistSettings = useCallback(async (next: AppSettings) => {
    settingsRef.current = next
    setSettings(next)
    setMasterVolume(next.volume)
    if (hasDesktopApi()) {
      await window.notamentor.saveSettings(next)
    } else {
      localStorage.setItem('notamentor.settings', JSON.stringify(next))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = hasDesktopApi()
          ? await window.notamentor.listLibrary()
          : JSON.parse(localStorage.getItem('notamentor.library') || '{"pieces":[]}')
        const saved = (raw.pieces ?? []) as Piece[]
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
        if (hasDesktopApi()) await window.notamentor.saveLibrary({ pieces: next })
      } catch (err) {
        if (!cancelled) {
          piecesRef.current = mergePieces([])
          setPieces(piecesRef.current)
          setError(err instanceof Error ? err.message : 'Не удалось открыть библиотеку')
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

  const importFromDisk = useCallback(async () => {
    if (!hasDesktopApi()) {
      setError('Импорт файлов доступен в установленном приложении')
      return []
    }
    const files = await window.notamentor.pickImport()
    const imported: Piece[] = []
    for (const file of files) {
      try {
        imported.push(await importPickedFile(file))
      } catch (err) {
        setError(err instanceof Error ? err.message : `Не удалось импортировать ${file.name}`)
      }
    }
    if (imported.length) await persistPieces([...piecesRef.current, ...imported])
    return imported
  }, [persistPieces])

  const touchPractice = useCallback(
    async (id: string, seconds: number, accuracy?: number) => {
      const nextPieces = piecesRef.current.map((p) =>
        p.id === id
          ? {
              ...p,
              practiceSeconds: p.practiceSeconds + seconds,
              lastPracticedAt: new Date().toISOString(),
              bestAccuracy:
                accuracy == null ? p.bestAccuracy : Math.max(p.bestAccuracy ?? 0, Math.round(accuracy))
            }
          : p
      )
      await persistPieces(nextPieces)
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
