import {
  type BaseWindowConstructorOptions,
  type IpcRendererEvent,
  ipcRenderer,
} from 'electron'

const prefix = 'electron-window.'

export type Operations<T> = {
  getData: () => Promise<{ id: number; params: T | undefined } | undefined>
  // window
  open: (params?: T, options?: Partial<BaseWindowConstructorOptions>) => void
  close: () => void
  // fullscreen
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void
  isFullscreen: () => Promise<boolean>
  setFullscreen: (fullscreen: boolean) => void
  enterFullscreen: () => void
  exitFullscreen: () => void
  toggleFullscreen: () => void
  // maximize
  onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
  isMaximized: () => Promise<boolean>
  setMaximized: (maximized: boolean) => void
  maximize: () => void
  unmaximize: () => void
  toggleMaximized: () => void
  // focus
  onFocusChange: (callback: (focused: boolean) => void) => () => void
  isFocused: () => Promise<boolean>
  // traffic light
  onTrafficLightVisibilityChange: (
    callback: (visible: boolean) => void,
  ) => () => void
  getTrafficLightVisibility: () => Promise<boolean>
  setTrafficLightVisibility: (visible: boolean) => void
}

export const exposeOperations = <T>(): Operations<T> => {
  return {
    getData: () => ipcRenderer.invoke(`${prefix}getData`),
    // window
    open: (params?: T, options?: Partial<BaseWindowConstructorOptions>) =>
      ipcRenderer.send(`${prefix}open`, params, options),
    close: () => ipcRenderer.send(`${prefix}close`),
    // fullscreen
    onFullscreenChange: (callback: (fullscreen: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, fullscreen: boolean) =>
        callback(fullscreen)
      ipcRenderer.on(`${prefix}onFullscreenChange`, listener)
      return () => {
        ipcRenderer.off(`${prefix}onFullscreenChange`, listener)
      }
    },
    isFullscreen: () => ipcRenderer.invoke(`${prefix}isFullscreen`),
    setFullscreen: (fullscreen: boolean) =>
      ipcRenderer.send(`${prefix}setFullscreen`, fullscreen),
    enterFullscreen: () => ipcRenderer.send(`${prefix}enterFullscreen`),
    exitFullscreen: () => ipcRenderer.send(`${prefix}exitFullscreen`),
    toggleFullscreen: () => ipcRenderer.send(`${prefix}toggleFullscreen`),
    // maximize
    onMaximizeChange: (callback: (maximized: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, maximized: boolean) =>
        callback(maximized)
      ipcRenderer.on(`${prefix}onMaximizeChange`, listener)
      return () => {
        ipcRenderer.off(`${prefix}onMaximizeChange`, listener)
      }
    },
    isMaximized: () => ipcRenderer.invoke(`${prefix}isMaximized`),
    setMaximized: (maximized: boolean) =>
      ipcRenderer.send(`${prefix}setMaximized`, maximized),
    maximize: () => ipcRenderer.send(`${prefix}maximize`),
    unmaximize: () => ipcRenderer.send(`${prefix}unmaximize`),
    toggleMaximized: () => ipcRenderer.send(`${prefix}toggleMaximized`),
    // focus
    onFocusChange: (callback: (focused: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, focused: boolean) =>
        callback(focused)
      ipcRenderer.on(`${prefix}onFocusChange`, listener)
      return () => {
        ipcRenderer.off(`${prefix}onFocusChange`, listener)
      }
    },
    isFocused: () => ipcRenderer.invoke(`${prefix}isFocused`),
    // traffic light
    onTrafficLightVisibilityChange: (callback: (visible: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, visible: boolean) =>
        callback(visible)
      ipcRenderer.on(`${prefix}onTrafficLightVisibilityChange`, listener)
      return () => {
        ipcRenderer.off(`${prefix}onTrafficLightVisibilityChange`, listener)
      }
    },
    getTrafficLightVisibility: () =>
      ipcRenderer.invoke(`${prefix}getTrafficLightVisibility`),
    setTrafficLightVisibility: (visible: boolean) =>
      ipcRenderer.send(`${prefix}setTrafficLightVisibility`, visible),
  }
}
