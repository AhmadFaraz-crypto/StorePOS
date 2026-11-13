import { BrowserWindow } from 'electron'

// Print a receipt silently to the system's default printer — no dialog.
// Returns false if printing failed (e.g. no default printer), so the renderer
// can fall back to the on-screen print dialog.
export async function printReceiptSilent(html: string): Promise<boolean> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const ok = await new Promise<boolean>((resolve) => {
      win.webContents.print(
        { silent: true, printBackground: true, margins: { marginType: 'none' } },
        (success) => resolve(success)
      )
    })
    return ok
  } catch {
    return false
  } finally {
    if (!win.isDestroyed()) win.close()
  }
}
