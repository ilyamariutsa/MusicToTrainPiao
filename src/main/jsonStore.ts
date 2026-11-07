import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'fs'

function parseFile<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf-8')) as T
}

/** Keep a broken file for manual recovery instead of overwriting it on the next save. */
function quarantine(file: string): void {
  try {
    renameSync(file, `${file}.corrupt-${Date.now()}`)
  } catch {
    /* leave it in place */
  }
}

/**
 * Reads JSON written by {@link writeJson}. A broken file is set aside and the
 * previous good version (`.bak`) is used, so the library is never silently lost.
 */
export function readJson<T>(file: string, fallback: T): T {
  if (existsSync(file)) {
    try {
      return parseFile<T>(file)
    } catch {
      quarantine(file)
    }
  }
  const backup = `${file}.bak`
  if (existsSync(backup)) {
    try {
      return parseFile<T>(backup)
    } catch {
      /* no usable copy */
    }
  }
  return fallback
}

/**
 * Atomic save: the data goes to a temp file first and replaces the target only
 * when fully on disk. The previous version stays next to it as `.bak`.
 */
export function writeJson(file: string, value: unknown): void {
  const data = JSON.stringify(value, null, 2)
  const tmp = `${file}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, data, null, 'utf-8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  if (existsSync(file)) {
    try {
      copyFileSync(file, `${file}.bak`)
    } catch {
      /* backup is best effort */
    }
  }
  try {
    renameSync(tmp, file)
  } catch {
    // Antivirus or the search indexer can briefly lock the target on Windows.
    writeFileSync(file, data, 'utf-8')
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}
