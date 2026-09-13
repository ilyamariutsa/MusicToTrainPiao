import { useMemo, useState } from 'react'
import { GROUP_HINTS, GROUP_LABELS, type PieceGroup } from '../types'
import { difficultyReason } from '../lib/difficulty'
import { useLibrary } from '../store'
import { KEY_NAMES, pieceDuration } from '../lib/theory'

type Props = {
  onOpen: (pieceId: string) => void
}

const FILTERS: Array<PieceGroup | 'all' | 'favorites'> = [
  'all',
  'favorites',
  'beginner',
  'intermediate',
  'advanced',
  'warmup',
  'custom'
]

export function LibraryView({ onOpen }: Props) {
  const { pieces, importFromDisk, updatePiece, deletePiece, error, clearError } = useLibrary()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [query, setQuery] = useState('')
  const [importNote, setImportNote] = useState('')

  const visible = useMemo(() => {
    return pieces
      .filter((p) => {
        if (filter === 'favorites') return p.favorite
        if (filter === 'custom') return p.source === 'imported'
        if (filter !== 'all') return p.group === filter
        return true
      })
      .filter((p) => `${p.title} ${p.composer}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  }, [pieces, filter, query])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Библиотека</p>
          <h1>Ваши мелодии всегда под рукой</h1>
          <p className="lead">
            Импортируйте MusicXML, сжатый MXL, MIDI или текстовый .nota — файлы сохраняются в приложении и не
            пропадут после перезапуска.
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            const imported = await importFromDisk()
            if (imported.length) {
              setImportNote(
                imported
                  .map((p) => `${p.title}: ${GROUP_LABELS[p.group]}. ${difficultyReason(p, p.group)}`)
                  .join(' ')
              )
            }
          }}
        >
          Импортировать ноты
        </button>
      </header>

      {error ? (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={clearError}>
            Закрыть
          </button>
        </div>
      ) : null}
      {importNote ? (
        <div className="banner ok">
          <span>{importNote}</span>
          <button type="button" onClick={() => setImportNote('')}>
            Закрыть
          </button>
        </div>
      ) : null}

      <div className="toolbar">
        <input
          className="search"
          placeholder="Поиск по названию или композитору"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? 'chip active' : 'chip'}
              onClick={() => setFilter(item)}
            >
              {item === 'all' ? 'Все' : item === 'favorites' ? 'Избранное' : GROUP_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      {filter !== 'all' && filter !== 'favorites' ? <p className="hint">{GROUP_HINTS[filter]}</p> : null}

      <div className="piece-grid">
        {visible.map((piece) => {
          const minutes = Math.round(pieceDuration(piece.notes) / (piece.tempo / 60) / 60 * 10) / 10
          return (
            <article key={piece.id} className="piece-card">
              <div className="piece-card-top">
                <span className="tag">{GROUP_LABELS[piece.group]}</span>
                <button
                  type="button"
                  className={piece.favorite ? 'icon-btn on' : 'icon-btn'}
                  onClick={() => updatePiece(piece.id, { favorite: !piece.favorite })}
                  title="В избранное"
                >
                  ★
                </button>
              </div>
              <h3>{piece.title}</h3>
              <p>{piece.composer}</p>
              <p className="meta">
                {KEY_NAMES[piece.keySignature] ?? 'До мажор'} · {piece.timeSignature[0]}/{piece.timeSignature[1]} ·{' '}
                {piece.tempo} BPM · ~{minutes || 1} мин
              </p>
              <p className="meta">
                {piece.source === 'builtin' ? 'Встроено' : 'Импорт'}
                {piece.bestAccuracy != null ? ` · лучшая точность ${piece.bestAccuracy}%` : ''}
              </p>
              <label className="group-pick">
                Сложность
                <select
                  value={piece.group}
                  onChange={(e) => void updatePiece(piece.id, { group: e.target.value as PieceGroup })}
                >
                  <option value="beginner">Простые</option>
                  <option value="intermediate">Средние</option>
                  <option value="advanced">Сложные</option>
                  <option value="warmup">Разминка</option>
                  <option value="custom">Мои</option>
                </select>
              </label>
              <div className="piece-actions">
                <button type="button" className="btn primary" onClick={() => onOpen(piece.id)}>
                  Учить
                </button>
                {piece.source === 'imported' ? (
                  <button type="button" className="btn ghost" onClick={() => deletePiece(piece.id)}>
                    Удалить
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
      {visible.length === 0 ? <p className="empty">В этой группе пока пусто. Импортируйте произведение или смените фильтр.</p> : null}
    </div>
  )
}
