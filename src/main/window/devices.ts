import { BrowserWindow, dialog } from 'electron'
import fs from 'fs-extra'
import { getDevicesStore } from '../lib/store'
import * as window from 'share/main/lib/window'
import once from 'licia/once'
import { handleEvent } from 'share/main/lib/util'
import { IpcGetStore, IpcSetStore } from 'share/common/types'
import { IpcExportDevicesCsv, IpcImportDevicesCsv } from 'common/types'

const store = getDevicesStore()

let win: BrowserWindow | null = null

export function showWin() {
  if (win) {
    win.focus()
    return
  }

  initIpc()

  win = window.create({
    name: 'devices',
    minWidth: 960,
    minHeight: 640,
    width: 960,
    height: 640,
  })

  win.on('close', () => {
    win?.destroy()
    win = null
  })

  window.loadPage(win, { page: 'devices' })
}

const initIpc = once(() => {
  handleEvent('setDevicesStore', <IpcSetStore>(
    ((name, val) => store.set(name, val))
  ))
  handleEvent('getDevicesStore', <IpcGetStore>((name) => store.get(name)))
  store.on('change', (name) => {
    if (name === 'deviceMetadata') {
      window.sendTo('main', 'refreshDevices')
    }
  })
  handleEvent('importDevicesCsv', <IpcImportDevicesCsv>(async () => {
    if (!win) {
      return null
    }
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (result.canceled || !result.filePaths[0]) {
      return null
    }
    return fs.readFile(result.filePaths[0], 'utf8')
  }))
  handleEvent('exportDevicesCsv', <IpcExportDevicesCsv>(async (content) => {
    if (!win) {
      return null
    }
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'devices.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (result.canceled || !result.filePath) {
      return null
    }
    await fs.writeFile(result.filePath, content, 'utf8')
    return result.filePath
  }))
})
