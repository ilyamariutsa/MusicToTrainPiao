import { WARMUPS } from '../lib/pieces'
import { useLibrary } from '../store'

type Props = {
  onOpen: (pieceId: string) => void
}

const COPY: Record<string, string> = {
  'scale-60-1': 'Стандартная аппликатура, правая и левая рука вместе. Идеально в начале занятия.',
  'scale-60-2': 'Та же гамма, но шире по клавиатуре — следите за подкладыванием большого пальца.',
  'scale-67-1': 'Один диез. Полезно сразу после до мажора, чтобы не застревать в одной тональности.',
  'five-finger': 'Постановка руки без подкладывания. Считайте вслух: 1–2–3–4–5.',
  'arpeggio-c': 'Раскидываем аккорд до мажор. Смотрите на подсказки пальцев на клавишах.',
  'cadence-c': 'Главные аккорды. Слушайте, как тоника «просит» разрешения после доминанты.'
}

export function WarmupView({ onOpen }: Props) {
  // Warm-ups live in the library like the built-in pieces, so their progress is kept.
  const { pieces, recordWarmup } = useLibrary()

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Разминка</p>
          <h1>Пять минут, и руки уже думают вместе с головой</h1>
          <p className="lead">
            Гаммы, пять пальцев, арпеджио и каданс. Каждое упражнение открывается в том же режиме обучения, что и
            пьесы: ноты, звук, пальцы, медленный темп.
          </p>
        </div>
      </header>
      <div className="piece-grid">
        {WARMUPS.map((warmup) => {
          const piece = pieces.find((p) => p.id === warmup.id) ?? warmup
          const minutes = Math.round((piece.practiceSeconds ?? 0) / 60)
          return (
          <article key={piece.id} className="piece-card">
            <span className="tag">Разминка</span>
            <h3>{piece.title}</h3>
            <p>{COPY[piece.id] ?? piece.composer}</p>
            {minutes || piece.bestAccuracy != null ? (
              <p className="meta">
                {minutes ? `${minutes} мин` : 'меньше минуты'}
                {piece.bestAccuracy != null ? ` · лучшая точность ${piece.bestAccuracy}%` : ''}
              </p>
            ) : null}
            <div className="piece-actions">
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  await recordWarmup()
                  onOpen(piece.id)
                }}
              >
                Начать
              </button>
            </div>
          </article>
          )
        })}
      </div>
    </div>
  )
}
