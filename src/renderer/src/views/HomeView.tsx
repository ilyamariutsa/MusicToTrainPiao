import { GROUP_LABELS } from '../types'
import { useLibrary } from '../store'
import type { ViewId } from '../types'

type Props = {
  onOpen: (view: ViewId, pieceId?: string) => void
}

export function HomeView({ onOpen }: Props) {
  const { pieces, stats } = useLibrary()
  const last = [...pieces]
    .filter((p) => p.lastPracticedAt)
    .sort((a, b) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''))[0]
  const favorite = pieces.find((p) => p.favorite)
  const minutes = Math.round(stats.totalPracticeSeconds / 60)
  const trainerPct = stats.trainerTotal ? Math.round((stats.trainerCorrect / stats.trainerTotal) * 100) : 0

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Добро пожаловать</p>
          <h1>Учите любимые мелодии так, будто рядом педагог</h1>
          <p className="lead">
            Ноты двух ключей, звук, правильные пальцы и разбор по фразам. Можно открыть готовую пьесу или
            импортировать MusicXML и MIDI — всё останется в вашей библиотеке.
          </p>
        </div>
        <div className="hero-stats">
          <Stat label="Серия дней" value={`${stats.streakDays}`} />
          <Stat label="Минут за инструментом" value={`${minutes}`} />
          <Stat label="Тренажёр нот" value={stats.trainerTotal ? `${trainerPct}%` : '—'} />
        </div>
      </header>

      <section className="card-grid">
        <button type="button" className="launch-card gold" onClick={() => onOpen('practice', last?.id ?? pieces[0]?.id)}>
          <span>Продолжить</span>
          <strong>{last ? last.title : 'Первая пьеса'}</strong>
          <em>{last ? last.composer : 'Начните с простой мелодии'}</em>
        </button>
        <button type="button" className="launch-card" onClick={() => onOpen('library')}>
          <span>Библиотека</span>
          <strong>{pieces.length} произведений</strong>
          <em>Простые, средние, сложные, избранное</em>
        </button>
        <button type="button" className="launch-card" onClick={() => onOpen('trainer')}>
          <span>Тренажёр ключей</span>
          <strong>Скрипичный и басовый</strong>
          <em>Связываем ноту, клавишу и название</em>
        </button>
        <button type="button" className="launch-card" onClick={() => onOpen('durations')}>
          <span>Длительности</span>
          <strong>Сколько держать ноту</strong>
          <em>Четверть, восьмая, целая — на слух</em>
        </button>
        <button type="button" className="launch-card" onClick={() => onOpen('solfege')}>
          <span>Сольфеджио</span>
          <strong>Интервалы и ступени</strong>
          <em>Слух отдельно от разбора пьесы</em>
        </button>
        <button type="button" className="launch-card" onClick={() => onOpen('warmup')}>
          <span>Разминка</span>
          <strong>Гаммы, арпеджио, каданс</strong>
          <em>{stats.warmupSessions} занятий разминки</em>
        </button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>С чего начать сегодня</h2>
        </div>
        <div className="row-list">
          {(favorite ? [favorite, ...pieces.filter((p) => p.id !== favorite.id)] : pieces).slice(0, 4).map((piece) => (
            <button key={piece.id} type="button" className="row-item" onClick={() => onOpen('practice', piece.id)}>
              <div>
                <strong>{piece.title}</strong>
                <p>
                  {piece.composer} · {GROUP_LABELS[piece.group]}
                </p>
              </div>
              <span>{piece.favorite ? '★' : 'Открыть'}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
