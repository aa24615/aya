import { action, makeObservable, observable, runInAction, toJS } from 'mobx'
import BaseStore from 'share/renderer/store/BaseStore'
import { IDevice, IDeviceCsvRow, IDeviceMetadata } from 'common/types'
import each from 'licia/each'
import filter from 'licia/filter'
import concat from 'licia/concat'
import unique from 'licia/unique'
import { isRemoteDevice } from './lib/util'
import dataUrl from 'licia/dataUrl'
import isStr from 'licia/isStr'
import find from 'licia/find'
import { getDeviceMetadataKey, isDeviceOnline } from 'common/device'
import { ConcurrencyQueue, mapWithConcurrency } from './lib/concurrency'
import { createScreenshotThumbnail } from './lib/screenshot'

export type DeviceViewMode = 'table' | 'card'
export type DeviceScreenshotStatus = 'loading' | 'success' | 'error'

export interface IDeviceScreenshot {
  image?: string
  status: DeviceScreenshotStatus
  updatedAt: number
}

interface IScreenshotResult {
  status: 'success' | 'failed' | 'skipped'
}

export interface IScreenshotBatchResult {
  total: number
  success: number
  failed: number
  skipped: number
}

function clampScreenshotPaneWeight(weight: number) {
  return Math.max(25, Math.min(50, weight))
}

class Store extends BaseStore {
  filter = ''
  ip = ''
  port = ''
  devices: IDevice[] = []
  remoteDevices: IDevice[] = []
  deviceMetadata: Record<string, IDeviceMetadata> = {}
  screenshotPaneWeight = 40
  viewMode: DeviceViewMode = 'card'
  device: IDevice | null = null
  screenshot: string | null = null
  screenshots: Record<string, IDeviceScreenshot> = {}
  screenshotsRefreshing = false
  private screenshotTasks = new Map<string, Promise<IScreenshotResult>>()
  private screenshotRequestVersions = new Map<string, number>()
  private screenshotQueue = new ConcurrencyQueue(3)
  private screenshotBatch: Promise<IScreenshotBatchResult> | null = null
  private screenshotPaneWeightDirty = false
  constructor() {
    super()
    makeObservable(this, {
      ip: observable,
      port: observable,
      devices: observable,
      device: observable,
      remoteDevices: observable,
      deviceMetadata: observable,
      filter: observable,
      screenshotPaneWeight: observable,
      viewMode: observable,
      screenshot: observable,
      screenshots: observable,
      screenshotsRefreshing: observable,
      setIp: action,
      setPort: action,
      setFilter: action,
      selectDevice: action,
      updateDevices: action,
      removeRemoteDevice: action,
      setDeviceMetadata: action,
      importDevices: action,
      setScreenshotPaneWeight: action,
      setViewMode: action,
    })

    this.init()
    this.bindEvent()
  }
  async init() {
    const remoteDevices: IDevice[] = await main.getDevicesStore('remoteDevices')
    const screenshotPaneWeight: number =
      await main.getDevicesStore('screenshotPaneWeight')
    const deviceMetadata: Record<string, IDeviceMetadata> =
      await main.getDevicesStore('deviceMetadata')
    const viewMode: DeviceViewMode = await main.getDevicesStore('viewMode')
    runInAction(() => {
      if (remoteDevices) {
        this.remoteDevices = remoteDevices
      }
      if (
        !this.screenshotPaneWeightDirty &&
        typeof screenshotPaneWeight === 'number' &&
        Number.isFinite(screenshotPaneWeight)
      ) {
        this.screenshotPaneWeight = clampScreenshotPaneWeight(
          screenshotPaneWeight
        )
      }
      if (deviceMetadata) {
        this.deviceMetadata = deviceMetadata
      }
      if (viewMode === 'table' || viewMode === 'card') {
        this.viewMode = viewMode
      }
    })

    const devices: IDevice[] = await main.getMemStore('devices')
    this.updateDevices(devices)
  }
  setIp(ip: string) {
    this.ip = ip
  }
  setPort(port: string) {
    this.port = port
  }
  setFilter(filter: string) {
    this.filter = filter
  }
  setViewMode(viewMode: DeviceViewMode) {
    if (this.viewMode === viewMode) {
      return
    }
    this.selectDevice(null)
    this.viewMode = viewMode
    main.setDevicesStore('viewMode', viewMode)
  }
  selectDevice(device: IDevice | string | null) {
    if (isStr(device)) {
      const devices: IDevice[] = concat(this.devices, this.remoteDevices)
      device = find(devices, (d) => d.id === device) || null
    }
    if (device && isRemoteDevice(device.id) && device.type === 'offline') {
      const [ip, port] = device.id.split(':')
      this.ip = ip
      this.port = port
    }
    this.device = device
    this.screenshot = device ? this.screenshots[device.id]?.image || null : null
    if (device && isDeviceOnline(device)) {
      void this.refreshDeviceScreenshot(device)
    }
  }
  updateDevices(devices: IDevice[]) {
    const previousOnline = new Map(
      this.getAllDevices().map((device) => [device.id, isDeviceOnline(device)])
    )
    let remoteDevices: IDevice[] = toJS(this.remoteDevices)
    each(remoteDevices, (device) => {
      device.type = 'offline'
    })
    remoteDevices = unique(remoteDevices, (a, b) => {
      if (a.serialno && b.serialno) {
        return a.serialno === b.serialno
      }
      return a.id === b.id
    })
    remoteDevices = unique(
      concat(
        remoteDevices,
        filter(devices, (device) => isRemoteDevice(device.id))
      ),
      (a, b) => a.id === b.id
    )
    const deviceMetadata = { ...toJS(this.deviceMetadata) }
    let metadataChanged = false
    each(remoteDevices, (device) => {
      if (!device.serialno) {
        return
      }
      const idKey = getDeviceMetadataKey({
        id: device.id,
        serialno: '',
      })
      const importedMetadata = deviceMetadata[idKey]
      if (!importedMetadata) {
        return
      }
      const serialKey = getDeviceMetadataKey(device)
      deviceMetadata[serialKey] = {
        ...(deviceMetadata[serialKey] || {
          deviceName: '',
          remark: '',
        }),
        ...importedMetadata,
      }
      delete deviceMetadata[idKey]
      metadataChanged = true
    })
    this.devices = filter(devices, (device) => !isRemoteDevice(device.id))

    this.remoteDevices = remoteDevices
    main.setDevicesStore('remoteDevices', remoteDevices)
    if (metadataChanged) {
      this.deviceMetadata = deviceMetadata
      main.setDevicesStore('deviceMetadata', deviceMetadata)
    }

    each(this.getAllDevices(), (device) => {
      if (previousOnline.get(device.id) && !isDeviceOnline(device)) {
        this.invalidateScreenshotRequest(device.id)
      }
    })

    if (this.device) {
      const id = this.device.id
      const device = find(
        concat(remoteDevices, this.devices),
        (device) => device.id === id
      )
      if (device) {
        this.device = device
      } else {
        this.selectDevice(null)
      }
    }

    const deviceIds = new Set(this.getAllDevices().map((device) => device.id))
    const screenshots = { ...this.screenshots }
    let screenshotsChanged = false
    Object.keys(screenshots).forEach((id) => {
      if (!deviceIds.has(id)) {
        delete screenshots[id]
        this.invalidateScreenshotRequest(id)
        screenshotsChanged = true
      }
    })
    if (screenshotsChanged) {
      this.screenshots = screenshots
    }
  }
  removeRemoteDevice(id: string) {
    const device = find(this.remoteDevices, (device) => device.id === id)
    this.remoteDevices = filter(this.remoteDevices, (device) => {
      return device.id !== id
    })
    if (this.device?.id === id) {
      this.selectDevice(null)
    }
    if (this.screenshots[id]) {
      const screenshots = { ...this.screenshots }
      delete screenshots[id]
      this.screenshots = screenshots
    }
    this.invalidateScreenshotRequest(id)
    main.setDevicesStore('remoteDevices', toJS(this.remoteDevices))
    if (device) {
      const key = getDeviceMetadataKey(device)
      const deviceMetadata = { ...toJS(this.deviceMetadata) }
      delete deviceMetadata[key]
      this.deviceMetadata = deviceMetadata
      main.setDevicesStore('deviceMetadata', deviceMetadata)
    }
  }
  getDeviceMetadata(device: Pick<IDevice, 'id' | 'serialno'>) {
    return (
      this.deviceMetadata[getDeviceMetadataKey(device)] || {
        deviceName: '',
        remark: '',
      }
    )
  }
  setDeviceMetadata(device: IDevice, deviceName: string, remark: string) {
    const key = getDeviceMetadataKey(device)
    this.deviceMetadata = {
      ...toJS(this.deviceMetadata),
      [key]: {
        deviceName: deviceName.trim(),
        remark: remark.trim(),
      },
    }
    main.setDevicesStore('deviceMetadata', toJS(this.deviceMetadata))
  }
  importDevices(rows: IDeviceCsvRow[]) {
    const remoteDevices = toJS(this.remoteDevices)
    const deviceMetadata = { ...toJS(this.deviceMetadata) }
    const devices = concat(toJS(this.devices), remoteDevices)

    each(rows, (row) => {
      let device = find(devices, (device) => device.id === row.id)
      if (isRemoteDevice(row.id)) {
        if (!device) {
          device = {
            id: row.id,
            name: row.model || '',
            serialno: row.serialno || '',
            androidVersion: row.androidVersion || '',
            sdkVersion: row.sdkVersion || '',
            type: 'offline',
          }
          remoteDevices.push(device)
          devices.push(device)
        } else if (find(remoteDevices, (remote) => remote.id === row.id)) {
          if (row.model !== undefined) {
            device.name = row.model
          }
          if (row.serialno !== undefined) {
            device.serialno = row.serialno
          }
          if (row.androidVersion !== undefined) {
            device.androidVersion = row.androidVersion
          }
          if (row.sdkVersion !== undefined) {
            device.sdkVersion = row.sdkVersion
          }
        }
      }

      if (!device && row.serialno) {
        device = find(devices, (device) => device.serialno === row.serialno)
      }
      const metadataDevice = {
        id: row.id,
        serialno: row.serialno || device?.serialno || '',
      }
      const key = getDeviceMetadataKey(metadataDevice)
      const current = deviceMetadata[key] || {
        deviceName: '',
        remark: '',
      }
      deviceMetadata[key] = {
        deviceName:
          row.deviceName === undefined ? current.deviceName : row.deviceName,
        remark: row.remark === undefined ? current.remark : row.remark,
      }
    })

    this.remoteDevices = remoteDevices
    this.deviceMetadata = deviceMetadata
    if (this.device) {
      this.device =
        find(
          concat(this.devices, remoteDevices),
          (device) => device.id === this.device?.id
        ) || null
    }
    main.setDevicesStore('remoteDevices', remoteDevices)
    main.setDevicesStore('deviceMetadata', deviceMetadata)
  }
  getAllDevices() {
    return concat(this.devices, this.remoteDevices)
  }
  setScreenshotPaneWeight(weight: number) {
    const screenshotPaneWeight = clampScreenshotPaneWeight(weight)
    this.screenshotPaneWeightDirty = true
    this.screenshotPaneWeight = screenshotPaneWeight
    main.setDevicesStore('screenshotPaneWeight', screenshotPaneWeight)
  }
  refreshDeviceScreenshot(
    device: IDevice | null = this.device
  ): Promise<IScreenshotResult> {
    if (!device || !isDeviceOnline(device)) {
      return Promise.resolve<IScreenshotResult>({ status: 'skipped' })
    }
    return this.requestScreenshot(device)
  }
  refreshAllScreenshots(): Promise<IScreenshotBatchResult> {
    if (this.screenshotBatch) {
      return this.screenshotBatch
    }

    const devices = unique(
      filter(this.getAllDevices(), (device) => isDeviceOnline(device)),
      (a, b) => a.id === b.id
    )
    if (devices.length === 0) {
      return Promise.resolve<IScreenshotBatchResult>({
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
      })
    }

    runInAction(() => {
      this.screenshotsRefreshing = true
    })
    const startedAt = Date.now()
    const batch = mapWithConcurrency(devices, 3, (device) => {
      const screenshot = this.screenshots[device.id]
      if (
        screenshot?.status === 'success' &&
        screenshot.updatedAt >= startedAt
      ) {
        return Promise.resolve<IScreenshotResult>({ status: 'success' })
      }
      return this.requestScreenshot(device)
    })
      .then((results) => {
        return {
          total: results.length,
          success: results.filter((result) => result.status === 'success')
            .length,
          failed: results.filter((result) => result.status === 'failed').length,
          skipped: results.filter((result) => result.status === 'skipped')
            .length,
        }
      })
      .finally(() => {
        runInAction(() => {
          this.screenshotsRefreshing = false
        })
        if (this.screenshotBatch === batch) {
          this.screenshotBatch = null
        }
      })
    this.screenshotBatch = batch
    return batch
  }
  private requestScreenshot(device: IDevice) {
    const runningTask = this.screenshotTasks.get(device.id)
    if (runningTask) {
      return runningTask
    }

    const previous = this.screenshots[device.id]
    runInAction(() => {
      this.screenshots = {
        ...this.screenshots,
        [device.id]: {
          ...previous,
          status: 'loading',
          updatedAt: previous?.updatedAt || 0,
        },
      }
    })
    const requestVersion =
      (this.screenshotRequestVersions.get(device.id) || 0) + 1
    this.screenshotRequestVersions.set(device.id, requestVersion)
    const task = this.screenshotQueue.run<IScreenshotResult>(async () => {
      const current = find(
        this.getAllDevices(),
        (candidate) => candidate.id === device.id
      )
      if (this.screenshotRequestVersions.get(device.id) !== requestVersion) {
        return { status: 'skipped' }
      }
      if (!current || !isDeviceOnline(current)) {
        runInAction(() => this.restoreScreenshot(device.id, previous))
        return { status: 'skipped' }
      }
      return this.captureScreenshot(device, previous, requestVersion)
    })
    this.screenshotTasks.set(device.id, task)
    const cleanup = () => {
      if (this.screenshotTasks.get(device.id) === task) {
        this.screenshotTasks.delete(device.id)
      }
    }
    void task.then(cleanup, cleanup)
    return task
  }
  private async captureScreenshot(
    device: IDevice,
    previous: IDeviceScreenshot | undefined,
    requestVersion: number
  ): Promise<IScreenshotResult> {
    try {
      const data = await main.screencap(device.id)
      const fullImage = dataUrl.stringify(data, 'image/png')
      let thumbnail = fullImage
      try {
        thumbnail = await createScreenshotThumbnail(fullImage)
      } catch {
        // 缩略图转换失败时仍保留原始截图，避免整次截图被判定失败。
      }

      const current = find(
        this.getAllDevices(),
        (candidate) => candidate.id === device.id
      )
      if (
        this.screenshotRequestVersions.get(device.id) !== requestVersion ||
        !current ||
        !isDeviceOnline(current)
      ) {
        if (this.screenshotRequestVersions.get(device.id) !== requestVersion) {
          return { status: 'skipped' }
        }
        runInAction(() => this.restoreScreenshot(device.id, previous))
        return { status: 'skipped' }
      }

      runInAction(() => {
        this.screenshots = {
          ...this.screenshots,
          [device.id]: {
            image: thumbnail,
            status: 'success',
            updatedAt: Date.now(),
          },
        }
        if (this.device?.id === device.id) {
          this.screenshot = fullImage
        }
      })
      return { status: 'success' }
    } catch {
      const current = find(
        this.getAllDevices(),
        (candidate) => candidate.id === device.id
      )
      if (
        this.screenshotRequestVersions.get(device.id) !== requestVersion ||
        !current ||
        !isDeviceOnline(current)
      ) {
        if (this.screenshotRequestVersions.get(device.id) !== requestVersion) {
          return { status: 'skipped' }
        }
        runInAction(() => this.restoreScreenshot(device.id, previous))
        return { status: 'skipped' }
      }

      runInAction(() => {
        this.screenshots = {
          ...this.screenshots,
          [device.id]: {
            ...previous,
            status: 'error',
            updatedAt: previous?.updatedAt || 0,
          },
        }
      })
      return { status: 'failed' }
    }
  }
  private restoreScreenshot(id: string, previous?: IDeviceScreenshot) {
    const screenshots = { ...this.screenshots }
    if (previous) {
      screenshots[id] = previous
    } else {
      delete screenshots[id]
    }
    this.screenshots = screenshots
  }
  private invalidateScreenshotRequest(id: string) {
    this.screenshotRequestVersions.set(
      id,
      (this.screenshotRequestVersions.get(id) || 0) + 1
    )
    this.screenshotTasks.delete(id)
    const screenshot = this.screenshots[id]
    if (screenshot?.status === 'loading') {
      const screenshots = { ...this.screenshots }
      if (screenshot.image) {
        screenshots[id] = {
          ...screenshot,
          status: 'success',
        }
      } else {
        delete screenshots[id]
      }
      this.screenshots = screenshots
    }
  }
  private bindEvent() {
    main.on('changeMemStore', (name, val) => {
      switch (name) {
        case 'devices':
          this.updateDevices(val)
          break
      }
    })
  }
}

export default new Store()
