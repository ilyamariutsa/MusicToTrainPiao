import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'
import { appExecutable, createDesktopShortcuts } from './shortcuts'

const __dirname = dirname(fileURLToPath(import.meta.url))

type Json = Record<string, unknown>

function dataDir(): string {
  const dir = join(app.getPath('userData'), 'library')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function libraryPath(): string {
  return join(dataDir(), 'library.json')
}

function statsPath(): string {
  return join(dataDir(), 'stats.json')
}

function settingsPath(): string {
  return join(dataDir(), 'settings.json')
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#090b10',
    title: 'NotaMentor',
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(__dirname, '../../build/icon.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.setName('NotaMentor')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.notamentor.desktop.v4')
}

app.whenReady().then(() => {
  createWindow()
  void createDesktopShortcuts().catch(() => undefined)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('library:list', () => {
  return readJson(libraryPath(), { pieces: [] as Json[] })
})

ipcMain.handle('library:saveAll', (_event, payload: { pieces: Json[] }) => {
  writeJson(libraryPath(), payload)
  return { ok: true }
})

ipcMain.handle('stats:get', () => {
  return readJson(statsPath(), {
    totalPracticeSeconds: 0,
    trainerCorrect: 0,
    trainerTotal: 0,
    streakDays: 0,
    lastPracticeDate: null,
    warmupSessions: 0
  })
})

ipcMain.handle('stats:save', (_event, stats: Json) => {
  writeJson(statsPath(), stats)
  return { ok: true }
})

ipcMain.handle('import:pick', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Импорт нот или музыки',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Нотные и музыкальные файлы', extensions: ['musicxml', 'xml', 'mxl', 'mid', 'midi', 'nota'] },
      { name: 'MusicXML', extensions: ['musicxml', 'xml', 'mxl'] },
      { name: 'MIDI', extensions: ['mid', 'midi'] },
      { name: 'NotaMentor', extensions: ['nota'] },
      { name: 'Все файлы', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return []
  }

  return result.filePaths.map((filePath) => {
    const buffer = readFileSync(filePath)
    return {
      name: filePath.split(/[/\\]/).pop() ?? 'import',
      ext: extname(filePath).replace('.', '').toLowerCase(),
      base64: buffer.toString('base64')
    }
  })
})

ipcMain.handle('settings:get', () => {
  return readJson(settingsPath(), {
    keyCount: 76,
    showNoteNames: true,
    showRuNames: true,
    showStaffGuide: true,
    beginnerMode: true,
    sidebarCollapsed: false
  })
})

ipcMain.handle('settings:save', (_event, settings: Json) => {
  writeJson(settingsPath(), settings)
  return { ok: true }
})

ipcMain.handle('app:openUserData', async () => {
  await shell.openPath(dataDir())
  return { ok: true }
})

ipcMain.handle('app:createShortcuts', async () => {
  return createDesktopShortcuts()
})

ipcMain.handle('app:openInstallFolder', async () => {
  const { workDir } = appExecutable()
  await shell.openPath(workDir)
  return { ok: true }
})
