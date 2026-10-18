import { useMemo, useState } from 'react'
import appIcon from './assets/app-icon.png'
import { LibraryProvider, useLibrary } from './store'
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

function Shell() {
  const { pieces, ready, settings, updateSettings } = useLibrary()
  const [view, setView] = useState<ViewId>('home')
  const [pieceId, setPieceId] = useState<string | null>(null)
  const piece = useMemo(() => pieces.find((p) => p.id === pieceId) ?? null, [pieces, pieceId])
  const collapsed = settings.sidebarCollapsed

  const open = (next: ViewId, id?: string) => {
    if (id) setPieceId(id)
    setView(next === 'practice' && !id && !pieceId ? 'library' : next)
  }

  return (
    <div className={collapsed ? 'app collapsed' : 'app'}>
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
                <em>1.2.0</em>
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
      <main className="main">
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
