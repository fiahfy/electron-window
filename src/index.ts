import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  IpcMainInvokeEvent,
  app,
  ipcMain,
} from 'electron'
import windowStateKeeper, { State as _State } from 'electron-window-state'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type State = _State

export const createManager = <T>(
  baseCreateWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow,
) => {
  const isMac = process.platform === 'darwin'
  const savedDirectoryPath = app.getPath('userData')
  const savedPath = join(savedDirectoryPath, 'window-state.json')

  let visibilities: boolean[] = []

  const dataMap: {
    [id: number]: { index: number; params?: T }
  } = {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isVisibilities = (visibilities: any): visibilities is boolean[] =>
    Array.isArray(visibilities) &&
    visibilities.every((visibility: unknown) => typeof visibility === 'boolean')

  const restoreVisibilities = async () => {
    try {
      const json = await readFile(savedPath, 'utf8')
      const data = JSON.parse(json)
      if (isVisibilities(data)) {
        visibilities = data
      }
    } catch (e) {
      // noop
    }
  }

  const saveVisibilities = async () => {
    const json = JSON.stringify(visibilities)
    await writeFile(savedPath, json)
  }

  const getWindowFilename = (index: number) => `window-state_${index}.json`

  const deleteWindowFile = async (index: number) => {
    try {
      await unlink(join(savedDirectoryPath, getWindowFilename(index)))
    } catch (e) {
      // noop
    }
  }

  const getTrafficLightVisibility = (browserWindow: BrowserWindow) => {
    const isFullScreen = browserWindow.isFullScreen()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // @see https://github.com/electron/electron/blob/79e714a82506f133516749ff0447717e92104bc1/typings/internal-electron.d.ts#L38
    const isWindowButtonVisibility = browserWindow._getWindowButtonVisibility()
    return isMac && !isFullScreen && isWindowButtonVisibility
  }

  const createWindow = async (
    index: number,
    params?: T,
    options?: Partial<State>,
  ) => {
    if (options) {
      await deleteWindowFile(index)
    }

    const windowState = windowStateKeeper({
      path: savedDirectoryPath,
      file: getWindowFilename(index),
    })

    const browserWindow = baseCreateWindow({ ...windowState, ...options })

    dataMap[browserWindow.id] = { index, ...(params ? { params } : {}) }

    browserWindow.on('close', () => {
      delete dataMap[browserWindow.id]
      visibilities[index] = false
    })
    browserWindow.on('enter-full-screen', () => {
      browserWindow.webContents.send('sendFullscreen', true)
      browserWindow.webContents.send(
        'sendTrafficLightVisibility',
        getTrafficLightVisibility(browserWindow),
      )
    })
    browserWindow.on('leave-full-screen', () => {
      browserWindow.webContents.send('sendFullscreen', false)
      browserWindow.webContents.send(
        'sendTrafficLightVisibility',
        getTrafficLightVisibility(browserWindow),
      )
    })

    windowState.manage(browserWindow)

    return browserWindow
  }

  const getDefaultOptions = () => {
    const activeWindow = BrowserWindow.getFocusedWindow()
    if (!activeWindow) {
      return {
        height: 600,
        width: 800,
        x: 0,
        y: 0,
      }
    }

    const bounds = activeWindow.getBounds()

    return {
      ...bounds,
      x: bounds.x + 30,
      y: bounds.y + 30,
    }
  }

  const create = (params?: T) => {
    const index = visibilities.reduce(
      (acc, visibility, index) => (visibility ? acc : Math.min(index, acc)),
      visibilities.length,
    )
    visibilities[index] = true
    return createWindow(index, params, getDefaultOptions())
  }

  const restore = async () => {
    await restoreVisibilities()
    return visibilities.reduce(
      async (promise, visibility, index) => {
        const acc = await promise
        return visibility ? [...acc, await createWindow(index)] : acc
      },
      Promise.resolve([]) as Promise<BrowserWindow[]>,
    )
  }

  const save = () => saveVisibilities()

  // window
  ipcMain.handle('restoreWindow', (event: IpcMainInvokeEvent) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id
    if (!windowId) {
      return undefined
    }
    const data = dataMap[windowId]
    if (!data) {
      return undefined
    }
    const duplicated = { ...data }
    delete data.params
    return duplicated
  })
  ipcMain.handle('openWindow', (_event: IpcMainInvokeEvent, params?: T) =>
    create(params),
  )
  ipcMain.handle('closeWindow', (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return
    }
    window.close()
  })
  // fullscreen
  ipcMain.handle('isFullscreen', (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return false
    }
    return browserWindow.isFullScreen()
  })
  ipcMain.handle(
    'setFullscreen',
    (event: IpcMainInvokeEvent, fullscreen: boolean) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (!browserWindow) {
        return
      }
      browserWindow.setFullScreen(fullscreen)
    },
  )
  ipcMain.handle('enterFullscreen', (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.setFullScreen(true)
  })
  ipcMain.handle('exitFullscreen', (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.setFullScreen(false)
  })
  ipcMain.handle('toggleFullscreen', (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.setFullScreen(!browserWindow.isFullScreen())
  })
  // traffic light
  ipcMain.handle('getTrafficLightVisibility', (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return false
    }
    return getTrafficLightVisibility(browserWindow)
  })
  ipcMain.handle(
    'setTrafficLightVisibility',
    (event: IpcMainInvokeEvent, visibility: boolean) => {
      if (!isMac) {
        return
      }
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (!browserWindow) {
        return
      }
      browserWindow.setWindowButtonVisibility(visibility)
      browserWindow.webContents.send(
        'sendTrafficLightVisibility',
        getTrafficLightVisibility(browserWindow),
      )
    },
  )

  return {
    create,
    restore,
    save,
  }
}
