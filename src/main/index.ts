import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { startScannerServer, getScannerInfo } from './scanner-server'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Window/taskbar icon for Windows & Linux (macOS uses the bundle icon).
  const iconPath = join(__dirname, '../../build/icon.png')
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    title: 'StorePOS',
    autoHideMenuBar: true,
    backgroundColor: '#e9ecef',
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow = win
  win.on('closed', () => {
    mainWindow = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  initDb()
  registerIpc()
  createWindow()

  // Phone-as-scanner: a local HTTPS + WebSocket server on the LAN. The phone
  // opens the pairing URL, scans with its camera, and codes stream back here.
  ipcMain.handle('scanner:info', () => getScannerInfo())
  try {
    await startScannerServer({
      onScan: (code) => mainWindow?.webContents.send('scanner:scan', code),
      onStatus: (connected) => mainWindow?.webContents.send('scanner:status', connected)
    })
  } catch (err) {
    console.error('Scanner server failed to start:', err)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
