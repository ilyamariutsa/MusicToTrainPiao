import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'
import type { Clef, Piece, ScoreNote } from '../types'
import { estimateDifficulty } from './difficulty'
import { assignFingering } from './fingering'
import { uid } from './theory'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true
})

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function text(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object' && value && '#text' in value) return String((value as { '#text': string })['#text'])
  return String(value)
}

function num(value: unknown, fallback = 0): number {
  const n = Number(text(value))
  return Number.isFinite(n) ? n : fallback
}

export async function importMusicXml(buffer: ArrayBuffer, fileName: string, ext: string): Promise<Piece> {
  let xml = ''
  if (ext === 'mxl') {
    const zip = await JSZip.loadAsync(buffer)
    const names = Object.keys(zip.files).filter((n) => n.endsWith('.xml') && !n.startsWith('META-INF'))
    const target = names[0]
    if (!target) throw new Error('В MXL-архиве нет MusicXML')
    xml = await zip.files[target].async('string')
  } else {
    xml = new TextDecoder('utf-8').decode(buffer)
  }

  const doc = parser.parse(xml)
  const score = doc['score-partwise'] ?? doc['score-timewise']
  if (!score) throw new Error('Это не MusicXML партитура')

  const workTitle =
    text(score.work?.['work-title']) ||
    text(score['movement-title']) ||
    fileName.replace(/\.(musicxml|xml|mxl)$/i, '')
  const composer =
    asArray(score.identification?.creator)
      .find((c) => text(c?.['@_type']) === 'composer' || !c?.['@_type'])
      ?.['#text'] ?? 'Импорт MusicXML'

  const parts = asArray(score.part)
  const notes: ScoreNote[] = []
  let tempo = 90
  let timeSignature: [number, number] = [4, 4]
  let keySignature = 0

  for (const part of parts) {
    let divisions = 1
    let currentClef: Clef = 'treble'
    const clefByStaff = new Map<number, Clef>()
    let absTime = 0

    for (const measure of asArray(part.measure)) {
      const attrs = measure.attributes
      if (attrs?.divisions) divisions = num(attrs.divisions, divisions)
      if (attrs?.time) {
        timeSignature = [num(asArray(attrs.time)[0].beats, 4), num(asArray(attrs.time)[0]['beat-type'], 4)]
      }
      if (attrs?.key?.fifths != null) keySignature = num(attrs.key.fifths, 0)
      for (const clef of asArray(attrs?.clef)) {
        const sign = text(clef.sign).toUpperCase()
        const staff = num(clef['@_number'], 1)
        const mapped: Clef = sign === 'F' ? 'bass' : 'treble'
        clefByStaff.set(staff, mapped)
        if (staff === 1) currentClef = mapped
      }

      const directionTempo = asArray(measure.direction)
        .flatMap((d) => asArray(d['sound'] ?? d.sound))
        .map((s) => num(s?.['@_tempo'], 0))
        .find((n) => n > 0)
      if (directionTempo) tempo = Math.round(directionTempo)

      let measureTime = 0
      let lastDuration = 0

      for (const ev of asArray(measure.note)) {
        const isChord = ev.chord != null
        const isRest = ev.rest != null
        const durationDiv = num(ev.duration, divisions)
        const beats = durationDiv / divisions
        if (isChord) {
          measureTime -= lastDuration
        }
        if (ev['grace'] != null) continue

        const staff = num(ev.staff, 1)
        const clef = clefByStaff.get(staff) ?? (ev.pitch && num(ev.pitch.octave, 4) < 4 ? 'bass' : currentClef)

        if (!isRest && ev.pitch) {
          const step = text(ev.pitch.step).toUpperCase()
          const alter = num(ev.pitch.alter, 0)
          const octave = num(ev.pitch.octave, 4)
          const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
          const midi = (octave + 1) * 12 + (base[step] ?? 0) + alter
          const fingerRaw = asArray(ev.notations)
            .flatMap((n) => asArray(n.technical))
            .map((t) => num(t.fingering, 0))
            .find((n) => n >= 1 && n <= 5)

          notes.push({
            id: uid('n'),
            midi,
            duration: Math.max(0.125, beats),
            time: absTime + measureTime,
            clef,
            finger: fingerRaw ? (fingerRaw as 1 | 2 | 3 | 4 | 5) : undefined
          })
        }

        lastDuration = beats
        measureTime += beats
      }
      absTime += (timeSignature[0] * 4) / timeSignature[1]
    }
  }

  assignFingering(notes)
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi)

  return {
    id: uid('imp'),
    title: String(workTitle),
    composer: String(composer),
    source: 'imported',
    group: estimateDifficulty({ notes, tempo }),
    favorite: false,
    timeSignature,
    keySignature,
    tempo,
    notes,
    createdAt: new Date().toISOString(),
    practiceSeconds: 0
  }
}
