import { unlinkSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  type BaseWindowConstructorOptions,
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  screen,
} from 'electron'
import windowStateKeeper from 'electron-window-state'
import { readFileSync, writeFileSync } from 'jsonfile'

const prefix = 'electron-window.'

type State = { ids: number[] }

export type WindowCreator = (
  optionsResolver: (
    options?: Partial<Pick<BaseWindowConstructorOptions, 'width' | 'height'>>,
  ) => BaseWindowConstructorOptions,
) => BrowserWindow

export const createManager = <T>(windowCreator: WindowCreator) => {
  const isMac = process.platform === 'darwin'
  const savedDirectoryPath = app.getPath('userData')
  const savedPath = join(savedDirectoryPath, 'window-state.json')

  let state: State = { ids: [] }

  const windowData: {
    [browserWindowId: number]: { id: number; params: T | undefined }
  } = {}

  // biome-ignore lint/suspicious/noExplicitAny: false positive
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
    } catch {
      // noop
    }
  }

  const saveState = () => {
    try {
      writeFileSync(savedPath, state)
    } catch {
      // noop
    }
  }

  const getWindowFilename = (id: number) => `window-state_${id}.json`

  const deleteWindowFile = (id: number) => {
    try {
      unlinkSync(join(savedDirectoryPath, getWindowFilename(id)))
    } catch {
      // noop
    }
  }

  const getTrafficLightVisibility = (browserWindow: BrowserWindow) => {
    const isFullScreen = browserWindow.isFullScreen()
    // @ts-expect-error
    // @see https://github.com/electron/electron/blob/79e714a82506f133516749ff0447717e92104bc1/typings/internal-electron.d.ts#L38
    const isWindowButtonVisibility = browserWindow._getWindowButtonVisibility()
    return isMac && !isFullScreen && isWindowButtonVisibility
  }

  const getBoundsByActiveWindow = () => {
    const activeWindow = BrowserWindow.getFocusedWindow()
    if (!activeWindow) {
      return undefined
    }

    const bounds = activeWindow.getBounds()
    return {
      ...bounds,
      x: bounds.x + 30,
      y: bounds.y + 30,
    }
  }

  const getBounds = (
    size: { height: number; width: number },
    byActiveWindow: boolean,
  ) => {
    if (byActiveWindow) {
      const activeWindowBounds = getBoundsByActiveWindow()
      if (activeWindowBounds) {
        return activeWindowBounds
      }
    }

    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const bounds = display.bounds

    return {
      ...size,
      x: bounds.x + Math.trunc((bounds.width - size.width) / 2),
      y: bounds.y + Math.trunc((bounds.height - size.height) / 2),
    }
  }

  const createWindow = (
    id: number,
    args?: {
      params?: T
      options?: Partial<BaseWindowConstructorOptions>
    },
  ) => {
    if (args) {
      deleteWindowFile(id)
    }

    const windowState = windowStateKeeper({
      path: savedDirectoryPath,
      file: getWindowFilename(id),
    })

    const browserWindow = windowCreator((options) => ({
      ...windowState,
      ...(args
        ? getBounds(
            {
              height: 600,
              width: 800,
              ...options,
              ...args.options,
            },
            !args.options,
          )
        : {}),
    }))

    windowData[browserWindow.id] = {
      id,
      params: args ? args.params : undefined,
    }

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

  const findMissingId = () =>
    state.ids
      .sort((a, b) => a - b)
      .reduce((acc, i) => (i === acc ? acc + 1 : acc), 1)

  const create = (
    params?: T,
    options?: Partial<BaseWindowConstructorOptions>,
  ) => {
    const id = findMissingId()
    state = { ...state, ids: [...state.ids, id] }
    return createWindow(id, { params, options })
  }

  const restore = () => {
    restoreState()
    return state.ids.map((id) => createWindow(id))
  }

  const save = () => saveState()

  ipcMain.handle(`${prefix}getData`, (event: IpcMainInvokeEvent) => {
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
  // window
  ipcMain.on(
    `${prefix}open`,
    (
      _event: IpcMainEvent,
      params: T | undefined,
      options: Partial<BaseWindowConstructorOptions> | undefined,
    ) => create(params, options),
  )
  ipcMain.on(`${prefix}close`, (event: IpcMainEvent) => {
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
  ipcMain.on(
    `${prefix}setFullscreen`,
    (event: IpcMainEvent, fullscreen: boolean) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (!browserWindow) {
        return
      }
      browserWindow.setFullScreen(fullscreen)
    },
  )
  ipcMain.on(`${prefix}enterFullscreen`, (event: IpcMainEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.setFullScreen(true)
  })
  ipcMain.on(`${prefix}exitFullscreen`, (event: IpcMainEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.setFullScreen(false)
  })
  ipcMain.on(`${prefix}toggleFullscreen`, (event: IpcMainEvent) => {
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
  ipcMain.on(
    `${prefix}setMaximized`,
    (event: IpcMainEvent, maximized: boolean) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (!browserWindow) {
        return
      }
      maximized ? browserWindow.maximize() : browserWindow.unmaximize()
    },
  )
  ipcMain.on(`${prefix}maximize`, (event: IpcMainEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.maximize()
  })
  ipcMain.on(`${prefix}unmaximize`, (event: IpcMainEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) {
      return
    }
    browserWindow.unmaximize()
  })
  ipcMain.on(`${prefix}toggleMaximize`, (event: IpcMainEvent) => {
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
  ipcMain.on(
    `${prefix}setTrafficLightVisibility`,
    (event: IpcMainEvent, visible: boolean) => {
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
