import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'
import { readJson, writeJson } from './jsonStore'
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

function windowStatePath(): string {
  return join(dataDir(), 'window.json')
}

type WindowState = { x?: number; y?: number; width: number; height: number; maximized?: boolean }

/** Last size and place of the window, if it still fits on a connected screen. */
function savedWindowState(): WindowState {
  const fallback: WindowState = { width: 1360, height: 880 }
  const saved = readJson<WindowState>(windowStatePath(), fallback)
  if (saved.x == null || saved.y == null) return { ...fallback, maximized: saved.maximized }
  const area = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }).workArea
  const visible =
    saved.x < area.x + area.width - 80 && saved.x + saved.width > area.x + 80 && saved.y >= area.y - 10 && saved.y < area.y + area.height - 80
  return visible ? saved : { ...fallback, maximized: saved.maximized }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const state = savedWindowState()
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: Math.max(1080, state.width),
    height: Math.max(720, state.height),
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

  win.on('ready-to-show', () => {
    if (state.maximized) win.maximize()
    win.show()
  })
  win.on('close', () => {
    try {
      writeJson(windowStatePath(), { ...win.getNormalBounds(), maximized: win.isMaximized() })
    } catch {
      /* the window state is only a convenience */
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // The window never leaves the app: a file dropped outside the drop handler would
  // otherwise replace the app with the file's contents (or start a download).
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
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
  // Same id as electron-builder's appId and the installer's shortcuts, so a pinned
  // taskbar icon and the running window are one button.
  app.setAppUserModelId('com.notamentor.app')
}

// One NotaMentor at a time: a second launch brings the open window forward instead of
// starting another copy that would write the same library files.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    // No Electron developer menu (Reload, DevTools) in the installed app.
    if (app.isPackaged) Menu.setApplicationMenu(null)
    mainWindow = createWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })
}

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

ipcMain.handle('import:pick', async (event) => {
  const options = {
    title: 'Импорт нот или музыки',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Нотные и музыкальные файлы', extensions: ['musicxml', 'xml', 'mxl', 'mid', 'midi', 'nota'] },
      { name: 'MusicXML', extensions: ['musicxml', 'xml', 'mxl'] },
      { name: 'MIDI', extensions: ['mid', 'midi'] },
      { name: 'NotaMentor', extensions: ['nota'] },
      { name: 'Все файлы', extensions: ['*'] }
    ]
  } satisfies Electron.OpenDialogOptions
  // Modal to the app window, like any Windows program's Open dialog.
  const owner = BrowserWindow.fromWebContents(event.sender)
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return []
  }

  // One unreadable file (locked, removed) must not cancel the others or vanish silently.
  return result.filePaths.map((filePath) => {
    const name = filePath.split(/[/\\]/).pop() ?? 'import'
    const ext = extname(filePath).replace('.', '').toLowerCase()
    try {
      return { name, ext, base64: readFileSync(filePath).toString('base64') }
    } catch (err) {
      return { name, ext, base64: '', error: err instanceof Error ? err.message : 'не читается' }
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
    sidebarCollapsed: false,
    volume: 80
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
