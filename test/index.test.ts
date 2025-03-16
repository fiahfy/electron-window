import { BrowserWindow, ipcMain } from 'electron'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { createManager } from '../src'

vi.mock('electron', () => {
  const BrowserWindow = vi.fn()
  const app = {
    getPath: () => 'dummy',
  }
  const ipcMain = {
    handle: vi.fn(),
    on: vi.fn(),
  }
  return { BrowserWindow, app, ipcMain }
})

describe('createManager', () => {
  test('should work', () => {
    const baseCreateWindow = () => new BrowserWindow()
    const manager = createManager(baseCreateWindow)
    expect(ipcMain.handle).toBeCalledTimes(5)
    expect(ipcMain.on).toBeCalledTimes(11)
    expectTypeOf(manager.create).toBeFunction()
    expectTypeOf(manager.restore).toBeFunction()
    expectTypeOf(manager.save).toBeFunction()
  })
})
