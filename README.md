# electron-window

[![Publish](https://github.com/fiahfy/electron-window/actions/workflows/publish.yml/badge.svg)](https://github.com/fiahfy/electron-window/actions/workflows/publish.yml)

> Manage Window States in Electron Apps.

## Installation

```bash
npm install @fiahfy/electron-window
```

## Usage

```js
// main.js
import { createManager } from '@fiahfy/electron-window'

const baseCreateWindow = (options) => {
  const browserWindow = new BrowserWindow({
    ...options,
      :
  })
    :
  return browserWindow
}

const manager = createManager(baseCreateWindow)

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await manager.create()
  }
})

app.on('before-quit', async () => {
  await manager.save()
})

app.whenReady().then(async () => {
  const browserWindows = await manager.restore()
  if (browserWindows.length === 0) {
    await manager.create()
  }
})
```

```js
// preload.js
import { exposeOperations } from '@fiahfy/electron-window/preload'

contextBridge.exposeInMainWorld('electronAPI', {
  ...exposeOperations(),
}
```
