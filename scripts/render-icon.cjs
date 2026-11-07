'use strict'
// Renders build/icon.svg (and icon-small.svg for 16/24 px) to the PNGs the app and installer use.
// Run with Electron so the browser's own SVG rasteriser is used:  npm run icon

const { app, BrowserWindow } = require('electron')
const { copyFileSync, readFileSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const root = join(__dirname, '..')
const build = join(root, 'build')
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const SMALL_UP_TO = 24

app.setPath('userData', join(tmpdir(), 'notamentor-icon-render'))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<!doctype html><title>icon</title>')
  const full = readFileSync(join(build, 'icon.svg')).toString('base64')
  const small = readFileSync(join(build, 'icon-small.svg')).toString('base64')
  for (const size of SIZES) {
    const svg = size <= SMALL_UP_TO ? small : full
    const png = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image()
      img.src = 'data:image/svg+xml;base64,${svg}'
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = ${size}
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, ${size}, ${size})
      return canvas.toDataURL('image/png').split(',')[1]
    })()`)
    writeFileSync(join(build, size === 512 ? 'icon.png' : `icon-${size}.png`), Buffer.from(png, 'base64'))
  }
  copyFileSync(join(build, 'icon-256.png'), join(root, 'src', 'renderer', 'src', 'assets', 'app-icon.png'))
  console.log(`rendered ${SIZES.join(', ')} px`)
  app.quit()
})
