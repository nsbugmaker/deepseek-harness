import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  create: vi.fn<(options: unknown) => ReturnType<typeof createWindow>>(),
  root: '/desktop-app',
}))
vi.mock('electron', () => ({
  app: { getAppPath: () => electron.root },
  BrowserWindow: vi.fn(function (options: unknown) { return electron.create(options) }),
}))

const { SPLASH_SIZE, closeSplashWindow, openSplashWindow, splashWindowOptions } = await import('../src/splash-window.ts')

function createWindow() {
  return {
    webContents: {
      setWindowOpenHandler: vi.fn<(handler: () => { action: string }) => void>(),
      on: vi.fn<(name: string, handler: (event: { preventDefault(): void }) => void) => void>(),
    },
    loadFile: vi.fn<(path: string) => Promise<undefined>>().mockResolvedValue(undefined),
    isDestroyed: vi.fn().mockReturnValue(false),
    destroy: vi.fn(),
    show: vi.fn(),
  }
}

beforeEach(() => { electron.create.mockReset() })

describe('desktop startup splash', () => {
  it.each([true, false])('stays frameless, fixed, and sandboxed (dark=%s)', (dark) => {
    const options = splashWindowOptions('win32', dark)
    expect(options).toMatchObject({
      width: SPLASH_SIZE.width,
      height: SPLASH_SIZE.height,
      useContentSize: true,
      center: true,
      frame: false,
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      backgroundColor: dark ? '#1b1b1c' : '#f9fafb',
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      },
    })
    // The splash renders its own asset; nothing needs a preload.
    expect(options.webPreferences?.preload).toBeUndefined()
  })

  it('rounds its corners on macOS only', () => {
    expect(splashWindowOptions('darwin', false).roundedCorners).toBe(true)
    expect(splashWindowOptions('linux', false).roundedCorners).toBeUndefined()
  })

  it('loads the packaged splash document, blocks navigation, and shows after the load', async () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    const shown = await openSplashWindow(true)
    expect(window.loadFile).toHaveBeenCalledWith(join('/desktop-app', 'renderer', 'splash.html'))
    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalled()
    const navigate = window.webContents.on.mock.calls.find(call => call[0] === 'will-navigate')?.[1]
    const event = { preventDefault: vi.fn() }
    navigate?.(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(window.show).toHaveBeenCalledTimes(1)
    expect(shown).toBe(window)
  })

  it('leaves a splash destroyed during its load off screen', async () => {
    const window = createWindow()
    window.loadFile.mockImplementation(async () => {
      window.isDestroyed.mockReturnValue(true)
      return undefined
    })
    electron.create.mockReturnValue(window)
    await openSplashWindow(false)
    expect(window.show).not.toHaveBeenCalled()
  })

  it('destroys a splash whose document failed to load, unless it is already gone', async () => {
    const failed = createWindow()
    failed.loadFile.mockRejectedValue(new Error('missing asset'))
    electron.create.mockReturnValue(failed)
    await expect(openSplashWindow(false)).rejects.toThrow('missing asset')
    expect(failed.destroy).toHaveBeenCalledTimes(1)
    expect(failed.show).not.toHaveBeenCalled()

    const vanished = createWindow()
    vanished.isDestroyed.mockReturnValue(true)
    vanished.loadFile.mockRejectedValue(new Error('missing asset'))
    electron.create.mockReturnValue(vanished)
    await expect(openSplashWindow(false)).rejects.toThrow('missing asset')
    expect(vanished.destroy).not.toHaveBeenCalled()
  })

  it('closes an open splash once and tolerates an absent or destroyed window', () => {
    const window = createWindow()
    closeSplashWindow(window as unknown as BrowserWindow)
    closeSplashWindow(window as unknown as BrowserWindow)
    expect(window.destroy).toHaveBeenCalledTimes(2)

    const destroyed = createWindow()
    destroyed.isDestroyed.mockReturnValue(true)
    closeSplashWindow(destroyed as unknown as BrowserWindow)
    expect(destroyed.destroy).not.toHaveBeenCalled()

    closeSplashWindow(undefined)
  })
})
