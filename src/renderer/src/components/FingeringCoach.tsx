import type { ScoreNote } from '../types'

type Props = {
  notes: ScoreNote[]
}

const ORDER: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5]

export function FingeringCoach({ notes }: Props) {
  const right = notes.filter((n) => n.clef === 'treble')
  const left = notes.filter((n) => n.clef === 'bass')

  return (
    <div className={notes.length ? 'finger-coach' : 'finger-coach idle'}>
      <div className="hands">
        <HandGraphic active={left.map((n) => n.finger).filter(Boolean) as Array<1 | 2 | 3 | 4 | 5>} side="left" />
        <HandGraphic active={right.map((n) => n.finger).filter(Boolean) as Array<1 | 2 | 3 | 4 | 5>} side="right" />
      </div>
    </div>
  )
}

function HandGraphic({ active, side }: { active: Array<1 | 2 | 3 | 4 | 5>; side: 'left' | 'right' }) {
  return (
    <div className={`hand ${side}`}>
      <div className="fingers">
        {(side === 'left' ? [...ORDER].reverse() : ORDER).map((n) => (
          <span key={n} className={active.includes(n) ? 'fg on' : 'fg'}>
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}
