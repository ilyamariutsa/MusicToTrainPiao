import { contextBridge, ipcRenderer } from 'electron'

export type ImportedFile = {
  name: string
  ext: string
  base64: string
}

const api = {
  listLibrary: () => ipcRenderer.invoke('library:list') as Promise<{ pieces: unknown[] }>,
  saveLibrary: (payload: { pieces: unknown[] }) =>
    ipcRenderer.invoke('library:saveAll', payload) as Promise<{ ok: boolean }>,
  getStats: () => ipcRenderer.invoke('stats:get'),
  saveStats: (stats: unknown) => ipcRenderer.invoke('stats:save', stats),
  pickImport: () => ipcRenderer.invoke('import:pick') as Promise<ImportedFile[]>,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  openUserData: () => ipcRenderer.invoke('app:openUserData'),
  createShortcuts: () =>
    ipcRenderer.invoke('app:createShortcuts') as Promise<{ desktop: string; startMenu: string }>,
  openInstallFolder: () => ipcRenderer.invoke('app:openInstallFolder'),
  platform: process.platform
}

contextBridge.exposeInMainWorld('notamentor', api)

export type NotaMentorApi = typeof api
