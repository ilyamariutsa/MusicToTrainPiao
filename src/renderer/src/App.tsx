import { useEffect, useMemo, useRef, useState } from 'react'
import appIcon from './assets/app-icon.png'
import { LibraryProvider, useLibrary, type PickedFile } from './store'
import type { ViewId } from './types'
import { DurationsView } from './views/DurationsView'
import { HomeView } from './views/HomeView'
import { LibraryView } from './views/LibraryView'
import { MetronomeView } from './views/MetronomeView'
import { PracticeView } from './views/PracticeView'
import { SettingsView } from './views/SettingsView'
import { SolfegeView } from './views/SolfegeView'
import { TrainerView } from './views/TrainerView'
import { WarmupView } from './views/WarmupView'

const NAV: Array<{ id: ViewId; label: string }> = [
  { id: 'home', label: 'Главная' },
  { id: 'library', label: 'Библиотека' },
  { id: 'trainer', label: 'Тренажёр' },
  { id: 'durations', label: 'Длительности' },
  { id: 'solfege', label: 'Сольфеджио' },
  { id: 'warmup', label: 'Разминка' },
  { id: 'metronome', label: 'Метроном' },
  { id: 'settings', label: 'Настройки' }
]

const IMPORTABLE = /\.(musicxml|xml|mxl|mid|midi|nota)$/i

/** Reads a dropped file the way the main process reads a picked one. */
async function readDropped(file: File): Promise<PickedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { name: file.name, ext, base64: btoa(binary) }
  } catch (err) {
    return { name: file.name, ext, base64: '', error: err instanceof Error ? err.message : 'не читается' }
  }
}

function Shell() {
  const { pieces, ready, settings, updateSettings, error, clearError, importFiles } = useLibrary()
  const [view, setView] = useState<ViewId>('home')
  const [pieceId, setPieceId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const piece = useMemo(() => pieces.find((p) => p.id === pieceId) ?? null, [pieces, pieceId])
  const collapsed = settings.sidebarCollapsed
  const mainRef = useRef<HTMLElement>(null)

  // Every screen opens at its top, not at the scroll position of the previous one.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [view, pieceId])

  const open = (next: ViewId, id?: string) => {
    if (id) setPieceId(id)
    setView(next === 'practice' && !id && !pieceId ? 'library' : next)
  }

  // Scores dropped anywhere on the window go straight into the library.
  const onDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }
  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const files = [...event.dataTransfer.files]
    if (files.length === 0) return
    const usable = files.filter((f) => IMPORTABLE.test(f.name))
    const skipped = files.length - usable.length
    const imported = await importFiles(await Promise.all(usable.map(readDropped)))
    if (imported.length) {
      setNotice(
        `Добавлено в библиотеку: ${imported.map((p) => `«${p.title}»`).join(', ')}` +
          (skipped ? `. Пропущено файлов другого формата: ${skipped}` : '')
      )
      if (imported.length === 1) open('practice', imported[0].id)
      else setView('library')
    } else if (skipped) {
      setNotice('Подходят файлы MusicXML (.musicxml, .xml, .mxl), MIDI (.mid) и .nota')
    }
  }

  return (
    <div
      className={collapsed ? 'app collapsed' : 'app'}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(event) => void onDrop(event)}
    >
      {dragging ? <div className="drop-overlay">Отпустите — ноты добавятся в библиотеку</div> : null}
      <aside className="sidebar">
        {collapsed ? (
          <button
            type="button"
            className="sidebar-toggle only"
            onClick={() => void updateSettings({ sidebarCollapsed: false })}
            title="Развернуть меню"
          >
            »
          </button>
        ) : (
          <>
            <div className="brand">
              <img className="logo" src={appIcon} alt="" width={42} height={42} />
              <div>
                <strong>NotaMentor</strong>
                <em>1.4.0</em>
              </div>
            </div>
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => void updateSettings({ sidebarCollapsed: true })}
            >
              Свернуть
            </button>
            <nav>
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={view === item.id ? 'nav-item active' : 'nav-item'}
                  onClick={() => setView(item.id)}
                >
                  <span>{item.label}</span>
                </button>
              ))}
              {piece ? (
                <button
                  type="button"
                  className={view === 'practice' ? 'nav-item active' : 'nav-item'}
                  onClick={() => setView('practice')}
                >
                  <span>Занятие</span>
                </button>
              ) : null}
            </nav>
          </>
        )}
      </aside>
      <main className="main" ref={mainRef}>
        {error || notice ? (
          <div className="toasts">
            {error ? (
              <div className="banner" role="alert">
                <span>{error}</span>
                <button type="button" onClick={clearError}>
                  Закрыть
                </button>
              </div>
            ) : null}
            {notice ? (
              <div className="banner ok" role="status">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)}>
                  Закрыть
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {!ready ? (
          <div className="page">
            <p>Открываем библиотеку…</p>
          </div>
        ) : view === 'home' ? (
          <HomeView onOpen={open} />
        ) : view === 'library' ? (
          <LibraryView onOpen={(id) => open('practice', id)} />
        ) : view === 'practice' && piece ? (
          <PracticeView piece={piece} />
        ) : view === 'practice' ? (
          <LibraryView onOpen={(id) => open('practice', id)} />
        ) : view === 'trainer' ? (
          <TrainerView />
        ) : view === 'durations' ? (
          <DurationsView />
        ) : view === 'solfege' ? (
          <SolfegeView />
        ) : view === 'warmup' ? (
          <WarmupView onOpen={(id) => open('practice', id)} />
        ) : view === 'metronome' ? (
          <MetronomeView />
        ) : (
          <SettingsView />
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <LibraryProvider>
      <Shell />
    </LibraryProvider>
  )
}
