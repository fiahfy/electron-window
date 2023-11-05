import { ipcRenderer } from 'electron'

export type Operations<T> = {
  closeWindow: () => Promise<void>
  restoreWindow: () => Promise<{ index: number; params?: T }>
  openWindow: (params?: T) => Promise<void>
}

export const exposeOperations = <T>(): Operations<T> => {
  return {
    closeWindow: () => ipcRenderer.invoke('closeWindow'),
    restoreWindow: () => ipcRenderer.invoke('restoreWindow'),
    openWindow: (params?: T) => ipcRenderer.invoke('openWindow', params),
  }
}
