const SMALL = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'and', 'or', 'for', 'de', 'la', 'le', 'von', 'van', 'da'])

const GENERIC = /^(piano|acoustic grand piano|musicxml|score|untitled|unknown|part|track|melody|импорт|импорт musicxml|импорт midi)$/i

export function isGenericCredit(value: string): boolean {
  return !value.trim() || GENERIC.test(value.trim())
}

/**
 * Turn a file name into a title and, only when the name says so, a composer:
 * "Artist - Title.mid" and MuseScore download slugs ("denis-stelmakh-count-to-ten")
 * name the author; "Twinkle_Twinkle_Little_Star" is just a title.
 */
export function humanizeFileName(fileName: string): { title: string; composer: string } {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  const explicit = base.split(/\s+[-–—]\s+|_-_|\s*--\s*/)
  if (explicit.length === 2 && explicit[0].trim() && explicit[1].trim()) {
    return { composer: titleCase(words(explicit[0])), title: titleCase(words(explicit[1])) }
  }
  const parts = words(base)
  if (parts.length === 0) return { title: 'Новая пьеса', composer: '' }
  // A slug joined by hyphens only: MuseScore puts the author first or last.
  if (/^[^\s_]+$/.test(base) && base.includes('-') && parts.length >= 4) {
    const small = (word: string): boolean => SMALL.has(word.toLowerCase())
    if (!small(parts[0]) && !small(parts[1]) && !small(parts[2])) {
      return { composer: titleCase(parts.slice(0, 2)), title: titleCase(parts.slice(2)) }
    }
    if (small(parts[0]) && !small(parts[parts.length - 1]) && !small(parts[parts.length - 2])) {
      return { composer: titleCase(parts.slice(-2)), title: titleCase(parts.slice(0, -2)) }
    }
  }
  return { title: titleCase(parts), composer: '' }
}

function words(text: string): string[] {
  return text.split(/[\s_-]+/).filter(Boolean)
}

/** English titles get Title Case; Russian ones only a capital first letter, as Russian writes them. */
function titleCase(list: string[]): string {
  if (list.some((word) => /[а-яё]/i.test(word))) {
    const text = list.join(' ').toLowerCase()
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  return list
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && SMALL.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}
