import { action, makeObservable, observable, runInAction, toJS } from 'mobx'
import BaseStore from 'share/renderer/store/BaseStore'
import {
  IDevice,
  IDeviceCsvRow,
  IDeviceMetadata,
  IDeviceScreenshotCache,
  IDeviceScreenshotCacheUpdate,
} from 'common/types'
import each from 'licia/each'
import filter from 'licia/filter'
import concat from 'licia/concat'
import unique from 'licia/unique'
import { isRemoteDevice, normalizeRemoteDeviceId } from './lib/util'
import dataUrl from 'licia/dataUrl'
import isStr from 'licia/isStr'
import find from 'licia/find'
import {
  getDeviceMetadataKey,
  getDeviceMetadataKeys,
  getDeviceScreenshotCacheKey,
  isDeviceOnline,
} from 'common/device'
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

function getNormalizedDeviceId(deviceId: string) {
  return normalizeRemoteDeviceId(deviceId) || deviceId
}

function mergeRemoteDevice(target: IDevice, source: IDevice) {
  const useSource = isDeviceOnline(source) || !isDeviceOnline(target)
  if (useSource) {
    target.name = source.name || target.name
    target.serialno = source.serialno || target.serialno
    target.androidVersion = source.androidVersion || target.androidVersion
    target.sdkVersion = source.sdkVersion || target.sdkVersion
    target.type = source.type
    return
  }

  target.name ||= source.name
  target.serialno ||= source.serialno
  target.androidVersion ||= source.androidVersion
  target.sdkVersion ||= source.sdkVersion
}

function mergeRemoteDevices(devices: IDevice[]) {
  const mergedDevices: IDevice[] = []
  const devicesById = new Map<string, IDevice>()
  each(devices, (device) => {
    const existing = devicesById.get(device.id)
    if (existing) {
      mergeRemoteDevice(existing, device)
      return
    }
    mergedDevices.push(device)
    devicesById.set(device.id, device)
  })
  return mergedDevices
}

function mergeImportedRow(
  previous: IDeviceCsvRow | undefined,
  row: IDeviceCsvRow,
  id: string
) {
  const merged = {
    ...previous,
    ...row,
    id,
  }
  const systemFieldKeys: (keyof IDeviceCsvRow)[] = [
    'serialno',
    'model',
    'androidVersion',
    'sdkVersion',
  ]
  for (const key of systemFieldKeys) {
    if (!row[key] && previous?.[key]) {
      merged[key] = previous[key]
    }
  }
  return merged
}

function migrateNormalizedIdMetadata(
  metadata: Record<string, IDeviceMetadata>,
  previousId: string,
  normalizedId: string
) {
  if (previousId === normalizedId) {
    return false
  }
  const previousKey = `id:${previousId}`
  const normalizedKey = `id:${normalizedId}`
  if (metadata[previousKey]) {
    metadata[normalizedKey] ||= metadata[previousKey]
    delete metadata[previousKey]
    return true
  }
  return false
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
  private screenshotCacheQueue = new ConcurrencyQueue(3)
  private screenshotBatch: Promise<IScreenshotBatchResult> | null = null
  private screenshotCacheLoads = new Map<
    string,
    Promise<IDeviceScreenshotCache | null>
  >()
  private initializedScreenshotCaches = new Set<string>()
  private screenshotPaneWeightDirty = false
  private initPromise: Promise<void>
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

    this.initPromise = this.init()
    this.bindEvent()
  }
  whenInitialized() {
    return this.initPromise
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
    this.updateDevices(devices || [])
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
    if (device) {
      void this.loadCachedScreenshot(device, true, true)
    }
  }
  updateDevices(devices: IDevice[]) {
    const previousOnline = new Map(
      this.getAllDevices().map((device) => [
        getNormalizedDeviceId(device.id),
        isDeviceOnline(device),
      ])
    )
    const deviceMetadata = { ...toJS(this.deviceMetadata) }
    let metadataChanged = false
    const storedRemoteDevices: IDevice[] = toJS(this.remoteDevices).map(
      (device) => {
        const normalizedId = getNormalizedDeviceId(device.id)
        metadataChanged =
          migrateNormalizedIdMetadata(
            deviceMetadata,
            device.id,
            normalizedId
          ) || metadataChanged
        return {
          ...device,
          id: normalizedId,
          type: 'offline',
        }
      }
    )
    const remoteDevices = mergeRemoteDevices(
      concat(
        storedRemoteDevices,
        filter(devices, (device) => isRemoteDevice(device.id)).map(
          (device) => ({
            ...device,
            id: getNormalizedDeviceId(device.id),
          })
        )
      )
    )
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
      const id = getNormalizedDeviceId(this.device.id)
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
        this.initializedScreenshotCaches.delete(id)
        this.invalidateScreenshotRequest(id)
        screenshotsChanged = true
      }
    })
    if (screenshotsChanged) {
      this.screenshots = screenshots
    }
    this.initializeCachedScreenshots(this.getAllDevices())
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
    this.initializedScreenshotCaches.delete(id)
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
    for (const key of getDeviceMetadataKeys(device)) {
      if (this.deviceMetadata[key]) {
        return this.deviceMetadata[key]
      }
    }
    return {
      deviceName: '',
      remark: '',
    }
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
    const deviceMetadata = { ...toJS(this.deviceMetadata) }
    const remoteDevices: IDevice[] = []
    const remoteById = new Map<string, IDevice>()
    each(toJS(this.remoteDevices), (storedDevice) => {
      const normalizedId = getNormalizedDeviceId(storedDevice.id)
      migrateNormalizedIdMetadata(
        deviceMetadata,
        storedDevice.id,
        normalizedId
      )
      const normalizedDevice = {
        ...storedDevice,
        id: normalizedId,
      }
      const existing = remoteById.get(normalizedId)
      if (existing) {
        mergeRemoteDevice(existing, normalizedDevice)
      } else {
        remoteDevices.push(normalizedDevice)
        remoteById.set(normalizedId, normalizedDevice)
      }
    })

    const devices = concat(toJS(this.devices), remoteDevices)
    const importedRows = new Map<string, IDeviceCsvRow>()
    each(rows, (row) => {
      const id = getNormalizedDeviceId(row.id)
      importedRows.set(id, mergeImportedRow(importedRows.get(id), row, id))
    })

    each(Array.from(importedRows.values()), (row) => {
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
          remoteById.set(row.id, device)
        } else if (remoteById.has(row.id) && !isDeviceOnline(device)) {
          if (row.model) {
            device.name = row.model
          }
          if (row.serialno) {
            device.serialno = row.serialno
          }
          if (row.androidVersion) {
            device.androidVersion = row.androidVersion
          }
          if (row.sdkVersion) {
            device.sdkVersion = row.sdkVersion
          }
        }
      }

      if (!device && row.serialno) {
        device = find(devices, (device) => device.serialno === row.serialno)
      }
      const idKey = getDeviceMetadataKey({
        id: row.id,
        serialno: '',
      })
      const metadataDevice = {
        id: row.id,
        serialno: device?.serialno || row.serialno || '',
      }
      const metadataKeys = getDeviceMetadataKeys(metadataDevice)
      const key = metadataKeys[0]
      const current =
        metadataKeys
          .map((metadataKey) => deviceMetadata[metadataKey])
          .find(Boolean) || {
          deviceName: '',
          remark: '',
        }
      deviceMetadata[key] = {
        deviceName:
          row.deviceName === undefined ? current.deviceName : row.deviceName,
        remark: row.remark === undefined ? current.remark : row.remark,
      }
      if (!isRemoteDevice(row.id) && key !== idKey) {
        delete deviceMetadata[idKey]
      }
    })

    this.remoteDevices = remoteDevices
    this.deviceMetadata = deviceMetadata
    if (this.device) {
      const selectedId = getNormalizedDeviceId(this.device.id)
      this.device =
        find(
          concat(this.devices, remoteDevices),
          (device) => device.id === selectedId
        ) || null
    }
    main.setDevicesStore('remoteDevices', remoteDevices)
    main.setDevicesStore('deviceMetadata', deviceMetadata)
    this.initializeCachedScreenshots(this.getAllDevices())
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
      const cachedScreenshot = await main.captureDeviceScreenshot(device.id)
      const fullImage = dataUrl.stringify(cachedScreenshot.data, 'image/png')
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
            updatedAt: cachedScreenshot.updatedAt,
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
        const currentScreenshot = this.screenshots[device.id]
        const fallback = currentScreenshot?.image
          ? currentScreenshot
          : previous
        this.screenshots = {
          ...this.screenshots,
          [device.id]: {
            ...fallback,
            status: 'error',
            updatedAt: fallback?.updatedAt || 0,
          },
        }
      })
      return { status: 'failed' }
    }
  }
  private restoreScreenshot(id: string, previous?: IDeviceScreenshot) {
    const screenshots = { ...this.screenshots }
    const current = screenshots[id]
    const fallback =
      current?.image && current.updatedAt >= (previous?.updatedAt || 0)
        ? current
        : previous
    if (fallback) {
      screenshots[id] = {
        ...fallback,
        status: fallback.image ? 'success' : fallback.status,
      }
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
  private initializeCachedScreenshots(devices: IDevice[]) {
    each(devices, (device) => {
      if (this.initializedScreenshotCaches.has(device.id)) {
        return
      }
      this.initializedScreenshotCaches.add(device.id)
      void this.loadCachedScreenshot(device, false)
    })
  }
  private readCachedScreenshot(deviceId: string, force = false) {
    const runningTask = this.screenshotCacheLoads.get(deviceId)
    if (runningTask && !force) {
      return runningTask
    }
    const task = main.getCachedDeviceScreenshot(deviceId)
    this.screenshotCacheLoads.set(deviceId, task)
    const cleanup = () => {
      if (this.screenshotCacheLoads.get(deviceId) === task) {
        this.screenshotCacheLoads.delete(deviceId)
      }
    }
    void task.then(cleanup, cleanup)
    return task
  }
  private async loadCachedScreenshot(
    device: IDevice,
    includeFullImage: boolean,
    force = false
  ) {
    return this.screenshotCacheQueue.run(
      () => this.loadCachedScreenshotNow(device, includeFullImage, force),
      includeFullImage || force
    )
  }
  private async loadCachedScreenshotNow(
    device: IDevice,
    includeFullImage: boolean,
    force: boolean
  ) {
    try {
      const cachedScreenshot = await this.readCachedScreenshot(device.id, force)
      if (!cachedScreenshot) {
        return
      }
      const fullImage = dataUrl.stringify(cachedScreenshot.data, 'image/png')
      let thumbnail = fullImage
      try {
        thumbnail = await createScreenshotThumbnail(fullImage)
      } catch {
        // 缓存原图无法生成缩略图时仍直接展示原图。
      }

      runInAction(() => {
        const deviceStillExists = find(
          this.getAllDevices(),
          (candidate) => candidate.id === device.id
        )
        if (!deviceStillExists) {
          return
        }
        const current = this.screenshots[device.id]
        if (current && current.updatedAt > cachedScreenshot.updatedAt) {
          return
        }
        this.screenshots = {
          ...this.screenshots,
          [device.id]: {
            image: thumbnail,
            status: 'success',
            updatedAt: cachedScreenshot.updatedAt,
          },
        }
        if (includeFullImage && this.device?.id === device.id) {
          this.screenshot = fullImage
        }
      })
    } catch {
      // 单个损坏或不可读的缓存不会阻止设备列表加载。
    }
  }
  private bindEvent() {
    main.on('changeMemStore', (name, val) => {
      switch (name) {
        case 'devices':
          void this.whenInitialized().then(() => this.updateDevices(val))
          break
      }
    })
    main.on(
      'deviceScreenshotUpdated',
      (update: IDeviceScreenshotCacheUpdate) => {
        each(this.getAllDevices(), (device) => {
          if (getDeviceScreenshotCacheKey(device.id) !== update.cacheKey) {
            return
          }
          void this.loadCachedScreenshot(
            device,
            this.device?.id === device.id,
            true
          )
        })
      }
    )
  }
}

export default new Store()
