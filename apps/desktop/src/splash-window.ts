/** Native startup splash: the only thing on screen while the Host has yet to produce a window. */

import { join } from 'node:path'
import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'

/**
 * Splash geometry: the fish mark with breathing room, no controls, no chrome.
 * The document is a self-contained asset, so the window never waits on the
 * frontend dist or the Host.
 */
export const SPLASH_SIZE = { width: 320, height: 200 }

/**
 * Resolve the startup splash's native material.
 * @param platform - operating system hosting Electron.
 * @param dark - whether the system color scheme resolves dark.
 * @returns frameless fixed-size window options over the packaged splash asset.
 */
export function splashWindowOptions(platform: NodeJS.Platform, dark: boolean): BrowserWindowConstructorOptions {
  return {
    width: SPLASH_SIZE.width,
    height: SPLASH_SIZE.height,
    useContentSize: true,
    center: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    // Opaque on purpose: a transparent frameless splash falls back to the
    // desktop behind the mark wherever the compositor cannot blur it.
    backgroundColor: dark ? '#1b1b1c' : '#f9fafb',
    ...(platform === 'darwin' ? { roundedCorners: true } as const : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  }
}

/**
 * Open the startup splash and show it once its document has painted. A load
 * failure destroys the window instead of leaving an empty frame on screen.
 * @param dark - whether the system color scheme resolves dark.
 * @returns the visible splash window.
 */
export async function openSplashWindow(dark: boolean): Promise<BrowserWindow> {
  const window = new BrowserWindow(splashWindowOptions(process.platform, dark))
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  try {
    await window.loadFile(join(app.getAppPath(), 'renderer', 'splash.html'))
  } catch (error) {
    if (!window.isDestroyed()) window.destroy()
    throw error
  }
  if (!window.isDestroyed()) window.show()
  return window
}

/**
 * Remove the splash. Safe to call for a window that never opened and more than
 * once, so a dismissed startup can keep calling it on its way out.
 * @param window - splash window, or undefined when none was created.
 */
export function closeSplashWindow(window: BrowserWindow | undefined): void {
  if (window === undefined || window.isDestroyed()) return
  window.destroy()
}
