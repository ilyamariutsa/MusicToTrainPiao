const SMALL = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'and', 'or', 'for', 'de', 'la', 'le', 'von', 'van', 'da'])

const GENERIC = /^(piano|acoustic grand piano|musicxml|score|untitled|unknown|part|track|melody|импорт|импорт musicxml|импорт midi)$/i

export function isGenericCredit(value: string): boolean {
  return !value.trim() || GENERIC.test(value.trim())
}

/** Turn a download slug into a title and, when it is obvious, a composer. */
export function humanizeFileName(fileName: string): { title: string; composer: string } {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  const parts = base.split(/[\s_-]+/).filter(Boolean)
  if (parts.length === 0) return { title: 'Новая пьеса', composer: '' }
  const small = (word: string): boolean => SMALL.has(word.toLowerCase())
  if (parts.length >= 4 && !small(parts[0]) && !small(parts[1]) && !small(parts[2])) {
    return { composer: titleCase(parts.slice(0, 2)), title: titleCase(parts.slice(2)) }
  }
  if (parts.length >= 4 && small(parts[0]) && !small(parts[parts.length - 1]) && !small(parts[parts.length - 2])) {
    return { composer: titleCase(parts.slice(-2)), title: titleCase(parts.slice(0, -2)) }
  }
  return { title: titleCase(parts), composer: '' }
}

function titleCase(words: string[]): string {
  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && SMALL.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}
