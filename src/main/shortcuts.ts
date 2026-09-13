import { app } from 'electron'
import { copyFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export function appExecutable(): { target: string; workDir: string } {
  if (app.isPackaged) {
    return { target: process.execPath, workDir: dirname(process.execPath) }
  }
  const unpacked = join(app.getAppPath(), 'release', 'win-unpacked', 'NotaMentor.exe')
  if (existsSync(unpacked)) {
    return { target: unpacked, workDir: dirname(unpacked) }
  }
  return { target: process.execPath, workDir: app.getAppPath() }
}

function iconFile(): string {
  const packaged = join(process.resourcesPath || '', 'icon.ico')
  if (app.isPackaged && existsSync(packaged)) return packaged
  const nextToExe = join(appExecutable().workDir, 'NotaMentor.ico')
  if (existsSync(nextToExe)) return nextToExe
  return join(app.getAppPath(), 'build', 'icon.ico')
}

function setupCandidates(workDir: string): string[] {
  return [
    join(workDir, 'NotaMentor-Setup.exe'),
    join(app.getAppPath(), 'release', `NotaMentor-Setup-${app.getVersion()}.exe`),
    join(dirname(app.getAppPath()), 'release', `NotaMentor-Setup-${app.getVersion()}.exe`)
  ]
}

export async function createDesktopShortcuts(): Promise<{ desktop: string; startMenu: string; icon: string }> {
  const { target, workDir } = appExecutable()
  const icon = iconFile()
  const placed = join(workDir, 'NotaMentor.ico')
  if (existsSync(icon) && icon !== placed) {
    try {
      copyFileSync(icon, placed)
    } catch {
      /* ignore */
    }
  }
  const iconForShortcut = existsSync(placed) ? placed : icon
  const appShortcut = join(workDir, 'NotaMentor.lnk')
  const startMenu = join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NotaMentor.lnk')
  const setupInApp = join(workDir, 'NotaMentor-Setup.exe')
  const setupSrc = setupCandidates(workDir).find((file) => existsSync(file) && file !== setupInApp)
  if (setupSrc) {
    try {
      copyFileSync(setupSrc, setupInApp)
    } catch {
      /* ignore */
    }
  }

  const script = `
    $w = New-Object -ComObject WScript.Shell
    foreach ($path in @(${JSON.stringify(appShortcut)}, ${JSON.stringify(startMenu)})) {
      if (Test-Path $path) { Remove-Item $path -Force }
      $s = $w.CreateShortcut($path)
      $s.TargetPath = ${JSON.stringify(target)}
      $s.WorkingDirectory = ${JSON.stringify(workDir)}
      $s.WindowStyle = 1
      $s.Description = "NotaMentor — учим мелодии на пианино"
      $s.IconLocation = ${JSON.stringify(iconForShortcut + ',0')}
      $s.Save()
    }
  `
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
  return { desktop: appShortcut, startMenu, icon: iconForShortcut }
}
