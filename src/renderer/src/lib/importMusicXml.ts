import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'
import type { Clef, Piece, ScoreBar, ScoreNote } from '../types'
import { estimateDifficulty } from './difficulty'
import { assignFingering } from './fingering'
import { humanizeFileName, isGenericCredit } from './pieceTitle'
import { pedalSpans, roundBeat, tiePredecessors, uid } from './theory'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: true
})

type XNode = Record<string, unknown>

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export async function importMusicXml(buffer: ArrayBuffer, fileName: string, ext: string): Promise<Piece> {
  let xml = ''
  if (ext === 'mxl') {
    const zip = await JSZip.loadAsync(buffer)
    const names = Object.keys(zip.files).filter((name) => name.endsWith('.xml') && !name.startsWith('META-INF'))
    const target = names.find((name) => name.endsWith('score.xml')) ?? names[0]
    if (!target) throw new Error('В MXL-архиве нет MusicXML')
    xml = await zip.files[target].async('string')
  } else {
    xml = new TextDecoder('utf-8').decode(buffer)
  }

  const doc = parser.parse(xml) as XNode[]
  const score = doc.find((node) => tagName(node) === 'score-partwise')
  if (!score) throw new Error('Нужна партитура MusicXML partwise. Timewise-файлы пока не читаются.')

  const fromFile = humanizeFileName(fileName)
  const workTitle = textChild(score, 'work', 'work-title') || textChild(score, 'movement-title')
  const composerCredit = creatorName(score)
  const title = !isGenericCredit(workTitle) ? cleanCredit(workTitle) : fromFile.title
  const composer = !isGenericCredit(composerCredit) ? cleanCredit(composerCredit) : fromFile.composer || 'Неизвестный автор'

  const parts = children(score).filter((node) => tagName(node) === 'part')
  const notes: Array<ScoreNote & { part: number }> = []
  const bars: ScoreBar[] = []
  const dynamics: Array<{ part: number; time: number; velocity: number; accent: boolean }> = []
  const pedalEvents: Array<{ time: number; down: boolean }> = []
  let tempo = 0
  let openingTime: [number, number] = [4, 4]
  let openingKey = 0
  let openingMode = 'major' as 'major' | 'minor'
  let musicalNumber = 1
  // Notation programs write irregular measures on purpose (cadenzas, free intros): keep them whole.
  // Only OCR output, which sometimes glues bars together, is cut back to the time signature.
  const software = textChild(child(score, 'identification'), 'encoding', 'software')
  const trustMeasures = /musescore|finale|sibelius|dorico|noteflight|flat\.io/i.test(software)

  parts.forEach((part, partIndex) => {
    let divisions = 1
    let timeSignature: [number, number] = openingTime
    let keySignature = openingKey
    const clefByStaff = new Map<number, Clef>()
    let stavesInPart = 1
    let partTime = 0
    const measures = children(part).filter((node) => tagName(node) === 'measure')

    measures.forEach((measure, measureIndex) => {
      let cursor = 0
      let lastDuration = 0
      let high = 0
      const measureStart = partTime
      const mark = (): void => {
        if (cursor > high) high = cursor
      }

      for (const el of children(measure)) {
        const tag = tagName(el)
        if (tag === 'attributes') {
          const next = readAttributes(el, divisions, timeSignature, keySignature, clefByStaff)
          divisions = next.divisions
          timeSignature = next.timeSignature
          keySignature = next.keySignature
          if (next.staves > stavesInPart) stavesInPart = next.staves
          if (bars.length === 0 && partIndex === 0 && measureIndex === 0) {
            openingTime = timeSignature
            openingKey = keySignature
            if (next.mode) openingMode = next.mode
          }
        } else if (tag === 'direction' || tag === 'sound') {
          const found = tag === 'direction' ? readTempo(el) : Number(attr(el, 'tempo')) || 0
          if (found > 0 && tempo === 0) tempo = found
          const at = roundBeat(measureStart + cursor + offsetBeats(el, divisions))
          const level = readDynamics(el)
          if (level) dynamics.push({ part: partIndex, time: at, ...level })
          for (const down of readPedal(el)) pedalEvents.push({ time: at, down })
        } else if (tag === 'backup') {
          cursor = Math.max(0, cursor - durationBeats(el, divisions))
        } else if (tag === 'forward') {
          cursor += durationBeats(el, divisions)
          mark()
        } else if (tag === 'note') {
          if (has(el, 'grace') || has(el, 'cue')) continue
          const isChord = has(el, 'chord')
          const beats = durationBeats(el, divisions) || lastDuration || 0.25
          if (isChord) cursor = Math.max(0, cursor - lastDuration)
          if (!has(el, 'rest')) {
            const pitch = child(el, 'pitch')
            if (pitch) {
              const step = textOf(child(pitch, 'step')).toUpperCase()
              const alter = numberOf(child(pitch, 'alter'))
              const octave = numberOf(child(pitch, 'octave'), 4)
              const staffNo = numberOf(child(el, 'staff'), 1)
              const staff = resolveStaff(partIndex, staffNo, stavesInPart)
              const clef = clefByStaff.get(staffNo) ?? (staff === 2 ? 'bass' : 'treble')
              const finger = readFinger(el)
              // <tie> is the sounding tie (<tied> only draws the arc): a "stop" continues the earlier note.
              const tied = children(el).some((item) => tagName(item) === 'tie' && attr(item, 'type') === 'stop')
              // Keep the score's spelling (F♯ stays F♯ in a flat key, E♯ stays E♯).
              const spelled = STEP[step] != null && Number.isInteger(alter) && Math.abs(alter) <= 2
              notes.push({
                id: uid('n'),
                part: partIndex,
                midi: (octave + 1) * 12 + (STEP[step] ?? 0) + alter,
                duration: roundBeat(Math.max(0.125, beats)),
                time: roundBeat(measureStart + cursor),
                clef,
                staff,
                voice: numberOf(child(el, 'voice'), staff === 2 ? 5 : 1),
                finger,
                ...(spelled ? { step: step as ScoreNote['step'], alter } : {}),
                ...(tied ? { tied: true } : {})
              })
            }
          }
          lastDuration = beats
          cursor += beats
          mark()
        }
      }

      const declared = roundBeat((timeSignature[0] * 4) / timeSignature[1])
      // An upbeat (marked implicit, or a short first bar) keeps its real length in any program.
      const upbeat = high > 0.05 && high < declared - 0.05 && (attr(measure, 'implicit') === 'yes' || measureIndex === 0)
      const lengths = upbeat || trustMeasures ? [high > 0.05 ? roundBeat(high) : declared] : barLengths(declared, high)
      for (const length of lengths) {
        if (partIndex === 0) {
          bars.push({
            start: roundBeat(partTime),
            end: roundBeat(partTime + length),
            signature: timeSignature,
            number: upbeat ? 0 : musicalNumber,
            ...(keySignature !== openingKey ? { key: keySignature } : {})
          })
          if (!upbeat) musicalNumber += 1
        }
        partTime = roundBeat(partTime + length)
      }
    })
  })

  if (notes.length === 0) throw new Error('В файле не нашлось ни одной ноты')
  if (tempo <= 0) tempo = 96

  applyDynamics(notes, dynamics)
  const end = bars.length ? bars[bars.length - 1].end : Math.max(...notes.map((note) => note.time + note.duration))
  const pedal = pedalSpans(pedalEvents, end)
  const fitted: ScoreNote[] = fitNotesToBars(
    notes.map(({ part: _part, ...note }) => note),
    bars
  )
  // A tie whose first note was lost (grace, cue, cross-staff) must not leave the note unplayed.
  const previous = tiePredecessors(fitted)
  for (const note of fitted) if (note.tied && !previous.has(note.id)) delete note.tied
  assignFingering(fitted)
  fitted.sort((a, b) => a.time - b.time || a.midi - b.midi)

  return {
    id: uid('imp'),
    title,
    composer,
    source: 'imported',
    group: estimateDifficulty({ notes: fitted, tempo }),
    favorite: false,
    timeSignature: openingTime,
    keySignature: openingKey,
    ...(openingMode === 'minor' ? { mode: 'minor' as const } : {}),
    tempo: Math.round(tempo),
    notes: fitted,
    bars,
    ...(pedal.length ? { pedal } : {}),
    createdAt: new Date().toISOString(),
    practiceSeconds: 0
  }
}

/** MuseScore's default velocities for written dynamics; one-off accents are marked. */
const DYNAMIC_VELOCITY: Record<string, number> = {
  pppp: 10, ppp: 16, pp: 33, p: 49, mp: 64, mf: 80, f: 96, ff: 112, fff: 126, ffff: 127,
  fp: 96, sf: 112, sfz: 112, sffz: 120, sfp: 112, sfpp: 112, fz: 112, rf: 112, rfz: 112
}
const ACCENTS = new Set(['fp', 'sf', 'sfz', 'sffz', 'sfp', 'sfpp', 'fz', 'rf', 'rfz'])

/** Loudness from <sound dynamics> (percent of forte = MIDI 90) or from a written mark. */
function readDynamics(node: XNode): { velocity: number; accent: boolean } | null {
  const sound = tagName(node) === 'sound' ? node : child(node, 'sound')
  const percent = Number(attr(sound, 'dynamics'))
  const marks = children(node)
    .filter((item) => tagName(item) === 'direction-type')
    .flatMap((type) => children(type).filter((item) => tagName(item) === 'dynamics'))
    .flatMap((dyn) => children(dyn).map(tagName))
  const mark = marks.find((name) => DYNAMIC_VELOCITY[name] != null)
  const accent = mark != null && ACCENTS.has(mark)
  if (percent > 0) return { velocity: Math.min(1, (percent * 0.9) / 127), accent }
  if (mark) return { velocity: DYNAMIC_VELOCITY[mark] / 127, accent }
  return null
}

/** Each note takes the last dynamic of its part; an accent (sfz…) only touches its own beat. */
function applyDynamics(
  notes: Array<ScoreNote & { part: number }>,
  events: Array<{ part: number; time: number; velocity: number; accent: boolean }>
): void {
  if (events.length === 0) return
  const sorted = [...events].sort((a, b) => a.time - b.time)
  for (const note of notes) {
    let level: number | undefined
    for (const event of sorted) {
      if (event.part !== note.part || event.time > note.time + 0.001) continue
      if (!event.accent) level = event.velocity
      else if (Math.abs(event.time - note.time) < 0.01) level = event.velocity
    }
    if (level != null) note.velocity = Math.round(level * 1000) / 1000
  }
}

/** Pedal down/up marks → spans. A new "down" while held is a pedal change. */
function readPedal(node: XNode): boolean[] {
  const out: boolean[] = []
  for (const type of children(node).filter((item) => tagName(item) === 'direction-type')) {
    for (const pedal of children(type).filter((item) => tagName(item) === 'pedal')) {
      const kind = attr(pedal, 'type')
      if (kind === 'start' || kind === 'resume') out.push(true)
      else if (kind === 'stop' || kind === 'discontinue') out.push(false)
      else if (kind === 'change') out.push(false, true)
    }
  }
  const sound = tagName(node) === 'sound' ? node : child(node, 'sound')
  const damper = attr(sound, 'damper-pedal')
  if (out.length === 0 && damper) out.push(damper === 'yes' || Number(damper) > 0)
  return out
}

function offsetBeats(direction: XNode, divisions: number): number {
  const offset = numberOf(child(direction, 'offset'))
  return offset && divisions > 0 ? offset / divisions : 0
}

/** OCR exports sometimes glue several bars into one MusicXML measure. */
function barLengths(declared: number, content: number): number[] {
  const full = declared > 0 ? declared : 1
  if (content < 0.05) return [full]
  const lengths: number[] = []
  let left = content
  const sliver = full * 0.2
  while (left > sliver) {
    if (left <= full + sliver) {
      lengths.push(roundBeat(left))
      break
    }
    lengths.push(full)
    left = roundBeat(left - full)
  }
  return lengths.length ? lengths : [full]
}

function fitNotesToBars(notes: ScoreNote[], bars: ScoreBar[]): ScoreNote[] {
  if (bars.length === 0) return notes
  const fitted: ScoreNote[] = []
  for (const note of notes) {
    let time = note.time
    let duration = note.duration
    let piece = note
    for (let guard = 0; duration > 0.02 && guard < 24; guard += 1) {
      const bar =
        bars.find((item) => time >= item.start - 0.001 && time < item.end - 0.001) ?? bars[bars.length - 1]
      const room = roundBeat(bar.end - time)
      if (room <= 0.02) break
      if (duration <= room + 0.02) {
        fitted.push({ ...piece, time: roundBeat(time), duration: roundBeat(duration) })
        break
      }
      fitted.push({ ...piece, time: roundBeat(time), duration: room })
      time = roundBeat(time + room)
      duration = roundBeat(duration - room)
      // The rest of a note cut at a bar line is tied over: it keeps sounding, it is not struck again.
      piece = { ...note, id: uid('n'), tied: true }
    }
  }
  return fitted
}

function resolveStaff(partIndex: number, staffNo: number, stavesInPart: number): 1 | 2 {
  if (stavesInPart >= 2) return staffNo >= 2 ? 2 : 1
  return partIndex > 0 ? 2 : 1
}

function readAttributes(
  node: XNode,
  divisions: number,
  timeSignature: [number, number],
  keySignature: number,
  clefByStaff: Map<number, Clef>
): { divisions: number; timeSignature: [number, number]; keySignature: number; staves: number; mode?: 'major' | 'minor' } {
  const divisionNode = child(node, 'divisions')
  if (divisionNode) divisions = numberOf(divisionNode, divisions) || divisions
  const time = child(node, 'time')
  if (time) {
    // Additive meters ("3+2") count all their beats.
    const beats = textOf(child(time, 'beats'))
      .split('+')
      .reduce((sum, part) => sum + (Number(part) || 0), 0)
    timeSignature = [beats || 4, numberOf(child(time, 'beat-type'), 4) || 4]
  }
  const key = child(node, 'key')
  if (key && child(key, 'fifths')) keySignature = numberOf(child(key, 'fifths'), keySignature)
  const modeText = textOf(child(key, 'mode')).toLowerCase()
  const mode = modeText === 'minor' ? 'minor' : modeText === 'major' ? 'major' : undefined
  const staves = numberOf(child(node, 'staves'), 1)
  for (const clef of children(node).filter((item) => tagName(item) === 'clef')) {
    const sign = textOf(child(clef, 'sign')).toUpperCase()
    const staff = Number(attr(clef, 'number')) || 1
    clefByStaff.set(staff, sign === 'F' ? 'bass' : 'treble')
  }
  return { divisions, timeSignature, keySignature, staves, mode }
}

function readTempo(direction: XNode): number {
  const sound = child(direction, 'sound')
  const fromSound = Number(attr(sound, 'tempo'))
  if (fromSound > 0) return fromSound
  const typed = child(direction, 'direction-type')
  const metro = child(typed, 'metronome')
  const perMinute = numberOf(child(metro, 'per-minute'))
  return perMinute > 0 ? perMinute : 0
}

function readFinger(note: XNode): 1 | 2 | 3 | 4 | 5 | undefined {
  const notations = child(note, 'notations')
  const technical = child(notations, 'technical')
  const value = numberOf(child(technical, 'fingering'))
  if (value >= 1 && value <= 5) return value as 1 | 2 | 3 | 4 | 5
  return undefined
}

function durationBeats(node: XNode | undefined, divisions: number): number {
  const raw = numberOf(child(node, 'duration'))
  if (!raw || divisions <= 0) return 0
  return raw / divisions
}

function creatorName(score: XNode): string {
  const identification = child(score, 'identification')
  const creators = children(identification).filter((node) => tagName(node) === 'creator')
  const composer = creators.find((node) => attr(node, 'type') === 'composer') ?? creators[0]
  return textContent(composer)
}

function cleanCredit(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function tagName(node: XNode | undefined): string {
  if (!node) return ''
  return Object.keys(node).find((key) => key !== ':@') ?? ''
}

function children(node: XNode | undefined): XNode[] {
  if (!node) return []
  const value = node[tagName(node)]
  return Array.isArray(value) ? (value as XNode[]) : []
}

function child(node: XNode | undefined, name: string): XNode | undefined {
  return children(node).find((item) => tagName(item) === name)
}

function has(node: XNode | undefined, name: string): boolean {
  return children(node).some((item) => tagName(item) === name)
}

function attr(node: XNode | undefined, name: string): string {
  const attrs = node?.[':@'] as Record<string, string> | undefined
  return attrs?.[`@_${name}`] ?? ''
}

function textContent(node: XNode | undefined): string {
  if (!node) return ''
  const value = node[tagName(node)]
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    const text = (value as XNode[]).find((item) => item['#text'] != null)
    if (text) return String(text['#text'])
  }
  return ''
}

function textOf(node: XNode | undefined): string {
  return textContent(node).trim()
}

function textChild(node: XNode | undefined, first: string, second?: string): string {
  const mid = child(node, first)
  if (!second) return textContent(mid).trim()
  return textContent(child(mid, second)).trim()
}

function numberOf(node: XNode | undefined, fallback = 0): number {
  const value = Number(textContent(node))
  return Number.isFinite(value) ? value : fallback
}
