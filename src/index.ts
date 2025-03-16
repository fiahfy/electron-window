import { unlinkSync } from 'node:fs'
import { join } from 'node:path'
import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
  app,
  ipcMain,
} from 'electron'
import windowStateKeeper from 'electron-window-state'
import { readFileSync, writeFileSync } from 'jsonfile'

const prefix = 'electron-window.'

type State = { ids: number[] }

export const createManager = <T>(
  baseCreateWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow,
) => {
  const isMac = process.platform === 'darwin'
  const savedDirectoryPath = app.getPath('userData')
  const savedPath = join(savedDirectoryPath, 'window-state.json')

  let state: State = { ids: [] }

  const windowData: {
    [browserWindowId: number]: { id: number; params?: T }
  } = {}

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const isState = (state: any): state is State =>
    typeof state === 'object' &&
    state.ids &&
    Array.isArray(state.ids) &&
    state.ids.every((id: unknown) => typeof id === 'number')

  const restoreState = () => {
    try {
      const data = readFileSync(savedPath)
      if (isState(data)) {
        state = data
      }
    } catch (e) {
      // noop
    }
  }

  const saveState = () => {
    try {
      writeFileSync(savedPath, state)
    } catch (e) {
      // noop
    }
  }

  const getWindowFilename = (id: number) => `window-state_${id}.json`

  const deleteWindowFile = (id: number) => {
    try {
      unlinkSync(join(savedDirectoryPath, getWindowFilename(id)))
    } catch (e) {
      // noop
    }
  }

  const getTrafficLightVisibility = (browserWindow: BrowserWindow) => {
    const isFullScreen = browserWindow.isFullScreen()
    // @ts-ignore
    // @see https://github.com/electron/electron/blob/79e714a82506f133516749ff0447717e92104bc1/typings/internal-electron.d.ts#L38
    const isWindowButtonVisibility = browserWindow._getWindowButtonVisibility()
    return isMac && !isFullScreen && isWindowButtonVisibility
  }

  const createWindow = (
    id: number,
    params?: T,
    options?: BrowserWindowConstructorOptions,
  ) => {
    if (options) {
      deleteWindowFile(id)
    }

    const windowState = windowStateKeeper({
      path: savedDirectoryPath,
      file: getWindowFilename(id),
    })

    const browserWindow = baseCreateWindow({ ...windowState, ...options })

    windowData[browserWindow.id] = { id, ...(params ? { params } : {}) }

    browserWindow.on('close', () => {
      delete windowData[browserWindow.id]
      state = {
        ...state,
        ids: state.ids.filter((currentId) => currentId !== id),
      }
    })
    browserWindow.on('enter-full-screen', () => {
      browserWindow.webContents.send(`${prefix}onFullscreenChange`, true)
      browserWindow.webContents.send(
        `${prefix}onTrafficLightVisibilityChange`,
        getTrafficLightVisibility(browserWindow),
      )
    })
    browserWindow.on('leave-full-screen', () => {
      browserWindow.webContents.send(`${prefix}onFullscreenChange`, false)
      browserWindow.webContents.send(
        `${prefix}onTrafficLightVisibilityChange`,
        getTrafficLightVisibility(browserWindow),
      )
    })
    browserWindow.on('maximize', () =>
      browserWindow.webContents.send(`${prefix}onMaximizeChange`, true),
    )
    browserWindow.on('unmaximize', () =>
      browserWindow.webContents.send(`${prefix}onMaximizeChange`, false),
    )
    browserWindow.on('focus', () =>
      browserWindow.webContents.send(`${prefix}onFocusChange`, true),
    )
    browserWindow.on('blur', () =>
      browserWindow.webContents.send(`${prefix}onFocusChange`, false),
    )

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

  const findMissingId = () =>
    state.ids
      .sort((a, b) => a - b)
      .reduce((acc, i) => (i === acc ? acc + 1 : acc), 1)

  const create = (params?: T) => {
    const id = findMissingId()
    state = { ...state, ids: [...state.ids, id] }
    return createWindow(id, params, getDefaultOptions())
  }

  const restore = () => {
    restoreState()
    return state.ids.map((id) => createWindow(id))
  }

  const save = () => saveState()

  // window
  ipcMain.handle(`${prefix}restore`, (event: IpcMainInvokeEvent) => {
    const browserWindowId = BrowserWindow.fromWebContents(event.sender)?.id
    if (!browserWindowId) {
      return undefined
    }
    const data = windowData[browserWindowId]
    if (!data) {
      return undefined
    }
    const clonedData = { ...data }
    data.params = undefined
    return clonedData
  })
  ipcMain.handle(`${prefix}open`, (_event: IpcMainInvokeEvent, params?: T) =>
    create(params),
  )
  ipcMain.handle(`${prefix}close`, (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      return
    }
    window.close()
  })
  // fullscreen
  ipcMain.handle(`${prefix}isFullscreen`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return false
    }
    return browserWindow.isFullScreen()
  })
  ipcMain.handle(
    `${prefix}setFullscreen`,
    (event: IpcMainInvokeEvent, fullscreen: boolean) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (!browserWindow) {
        return
      }
      browserWindow.setFullScreen(fullscreen)
    },
  )
  ipcMain.handle(`${prefix}enterFullscreen`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.setFullScreen(true)
  })
  ipcMain.handle(`${prefix}exitFullscreen`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.setFullScreen(false)
  })
  ipcMain.handle(`${prefix}toggleFullscreen`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.setFullScreen(!browserWindow.isFullScreen())
  })
  // maximize
  ipcMain.handle(`${prefix}isMaximized`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return false
    }
    return browserWindow.isMaximized()
  })
  ipcMain.handle(
    `${prefix}setMaximized`,
    (event: IpcMainInvokeEvent, maximized: boolean) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (!browserWindow) {
        return
      }
      maximized ? browserWindow.maximize() : browserWindow.unmaximize()
    },
  )
  ipcMain.handle(`${prefix}maximize`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.maximize()
  })
  ipcMain.handle(`${prefix}unmaximize`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.unmaximize()
  })
  ipcMain.handle(`${prefix}toggleMaximize`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.isMaximized()
      ? browserWindow.unmaximize()
      : browserWindow.maximize()
  })
  // focus
  ipcMain.handle(`${prefix}isFocused`, (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return false
    }
    return browserWindow.isFocused()
  })
  // traffic light
  ipcMain.handle(
    `${prefix}getTrafficLightVisibility`,
    (event: IpcMainInvokeEvent) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (!browserWindow) {
        return false
      }
      return getTrafficLightVisibility(browserWindow)
    },
  )
  ipcMain.handle(
    `${prefix}setTrafficLightVisibility`,
    (event: IpcMainInvokeEvent, visible: boolean) => {
      if (!isMac) {
        return
      }
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (!browserWindow) {
        return
      }
      browserWindow.setWindowButtonVisibility(visible)
      browserWindow.webContents.send(
        `${prefix}onTrafficLightVisibilityChange`,
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
