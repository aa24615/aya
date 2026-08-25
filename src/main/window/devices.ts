import { BrowserWindow, dialog } from 'electron'
import fs from 'fs-extra'
import { getDevicesStore } from '../lib/store'
import * as window from 'share/main/lib/window'
import once from 'licia/once'
import { handleEvent } from 'share/main/lib/util'
import { IpcGetStore, IpcSetStore } from 'share/common/types'
import {
  IpcExportDevicesCsv,
  IpcGetDeviceCatalog,
  IpcImportDevicesCsv,
  IpcMergeDeviceCatalog,
  IpcRemoveDeviceCatalogEntry,
  IpcSetDeviceCatalogMetadata,
} from 'common/types'
import {
  getDeviceCatalogSnapshot,
  mergeDeviceCatalog,
  removeDeviceCatalogEntry,
  setDeviceCatalogMetadata,
} from '../lib/deviceCatalog'

const store = getDevicesStore()

let win: BrowserWindow | null = null

export function showWin() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) {
      win.restore()
    }
    if (!win.isVisible()) {
      win.show()
    }
    win.focus()
    return
  }
  win = null

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
  handleEvent(
    'getDeviceCatalog',
    <IpcGetDeviceCatalog>(async () => getDeviceCatalogSnapshot())
  )
  handleEvent('mergeDeviceCatalog', <IpcMergeDeviceCatalog>(
    (async (remoteDevices, deviceMetadata) =>
      mergeDeviceCatalog(remoteDevices, deviceMetadata))
  ))
  handleEvent(
    'removeDeviceCatalogEntry',
    <IpcRemoveDeviceCatalogEntry>(async (deviceId) =>
      removeDeviceCatalogEntry(deviceId)
    )
  )
  handleEvent(
    'setDeviceCatalogMetadata',
    <IpcSetDeviceCatalogMetadata>(
      (async (device, deviceName, remark) =>
        setDeviceCatalogMetadata(device, deviceName, remark))
    )
  )
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
