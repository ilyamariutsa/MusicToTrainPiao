import type { Piece } from '../types'
import { estimateDifficulty } from './difficulty'
import { assignFingering } from './fingering'
import { importMidi } from './importMidi'
import { importMusicXml } from './importMusicXml'
import { parseNotaDsl } from './notaDsl'
import { uid } from './theory'

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export async function importPickedFile(file: { name: string; ext: string; base64: string }): Promise<Piece> {
  const ext = file.ext.toLowerCase()
  const buffer = decodeBase64(file.base64)

  if (ext === 'mid' || ext === 'midi') {
    return importMidi(buffer, file.name)
  }
  if (ext === 'musicxml' || ext === 'xml' || ext === 'mxl') {
    return importMusicXml(buffer, file.name, ext)
  }
  if (ext === 'nota') {
    const text = new TextDecoder('utf-8').decode(buffer)
    const piece = parseNotaDsl(text, file.name.replace(/\.nota$/i, ''))
    // Fingers written in the file stay; the rest are suggested.
    assignFingering(piece.notes, { overwrite: false })
    // The id in the file is not unique: importing it twice or reusing a built-in id would clash.
    piece.id = uid('imp')
    piece.source = 'imported'
    // A group set in the file is kept; otherwise the difficulty is estimated.
    if (piece.group === 'custom') piece.group = estimateDifficulty(piece)
    return piece
  }
  throw new Error(`Формат .${ext} пока не поддерживается. Импортируйте MusicXML, MIDI или .nota`)
}
