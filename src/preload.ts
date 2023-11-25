import { IpcRendererEvent, ipcRenderer } from 'electron'

export type Operations<T> = {
  // window
  closeWindow: () => Promise<void>
  openWindow: (params?: T) => Promise<void>
  restoreWindow: () => Promise<{ index: number; params?: T }>
  // fullscreen
  addFullscreenListener: (callback: (fullscreen: boolean) => void) => () => void
  enterFullscreen: () => Promise<void>
  exitFullscreen: () => Promise<void>
  isFullscreen: () => Promise<boolean>
  setFullscreen: (fullscreen: boolean) => Promise<void>
  toggleFullscreen: () => Promise<void>
  // traffic light
  addTrafficLightListener: (
    callback: (visibility: boolean) => void,
  ) => () => void
  getTrafficLightVisibility: () => Promise<boolean>
  setTrafficLightVisibility: (visibility: boolean) => Promise<void>
}

export const exposeOperations = <T>(): Operations<T> => {
  return {
    // window
    closeWindow: () => ipcRenderer.invoke('closeWindow'),
    openWindow: (params?: T) => ipcRenderer.invoke('openWindow', params),
    restoreWindow: () => ipcRenderer.invoke('restoreWindow'),
    // fullscreen
    addFullscreenListener: (callback: (fullscreen: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, fullscreen: boolean) =>
        callback(fullscreen)
      ipcRenderer.on('sendFullscreen', listener)
      return () => ipcRenderer.removeListener('sendFullscreen', listener)
    },
    enterFullscreen: () => ipcRenderer.invoke('enterFullscreen'),
    exitFullscreen: () => ipcRenderer.invoke('exitFullscreen'),
    isFullscreen: () => ipcRenderer.invoke('isFullscreen'),
    setFullscreen: (fullscreen: boolean) =>
      ipcRenderer.invoke('setFullscreen', fullscreen),
    toggleFullscreen: () => ipcRenderer.invoke('toggleFullscreen'),
    // traffic light
    addTrafficLightListener: (callback: (visibility: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, visibility: boolean) =>
        callback(visibility)
      ipcRenderer.on('sendTrafficLightVisibility', listener)
      return () => {
        ipcRenderer.removeListener('sendTrafficLightVisibility', listener)
      }
    },
    getTrafficLightVisibility: () =>
      ipcRenderer.invoke('getTrafficLightVisibility'),
    setTrafficLightVisibility: (visibility: boolean) =>
      ipcRenderer.invoke('setTrafficLightVisibility', visibility),
  }
}
