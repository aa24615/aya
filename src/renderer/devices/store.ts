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
import {
  isRemoteDevice,
  normalizeRemoteDeviceId,
  parseRemoteDeviceId,
} from './lib/util'
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
import sleep from 'licia/sleep'

export type DeviceViewMode = 'table' | 'card'
export type DeviceScreenshotStatus = 'loading' | 'success' | 'error'
export type DeviceConnectionPhase =
  | 'waiting'
  | 'connecting'
  | 'verifying'
  | 'failed'
  | 'verificationFailed'

export interface IDeviceConnectionState {
  phase: DeviceConnectionPhase
  position: number
  total: number
}

export interface IDeviceRefreshProgress {
  completed: number
  total: number
}

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

export interface IDeviceRefreshResult {
  total: number
  online: number
  offline: number
}

function clampScreenshotPaneWeight(weight: number) {
  return Math.max(25, Math.min(50, weight))
}

function getNormalizedDeviceId(deviceId: string) {
  return normalizeRemoteDeviceId(deviceId) || deviceId
}

function getConnectionDeviceId(ip: string, port = 5555) {
  const deviceId = `${ip.trim()}:${port}`
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
  devicesRefreshing = false
  deviceConnecting = false
  deviceConnections: Record<string, IDeviceConnectionState> = {}
  deviceRefreshProgress: IDeviceRefreshProgress = {
    completed: 0,
    total: 0,
  }
  private screenshotTasks = new Map<string, Promise<IScreenshotResult>>()
  private screenshotRequestVersions = new Map<string, number>()
  private screenshotQueue = new ConcurrencyQueue(3)
  private screenshotCacheQueue = new ConcurrencyQueue(3)
  private screenshotBatch: Promise<IScreenshotBatchResult> | null = null
  private deviceRefreshTask: Promise<IDeviceRefreshResult> | null = null
  private deviceConnectionTask: Promise<void> | null = null
  private deviceConnectionOperation = 0
  private externalDeviceRevision = 0
  private screenshotCacheLoads = new Map<
    string,
    Promise<IDeviceScreenshotCache | null>
  >()
  private initializedScreenshotCaches = new Set<string>()
  private screenshotPaneWeightDirty = false
  private catalogRequest = 0
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
      devicesRefreshing: observable,
      deviceConnecting: observable,
      deviceConnections: observable,
      deviceRefreshProgress: observable,
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
    const [catalog, screenshotPaneWeight, viewMode] = await Promise.all([
      main.getDeviceCatalog(),
      main.getDevicesStore('screenshotPaneWeight') as Promise<number>,
      main.getDevicesStore('viewMode') as Promise<DeviceViewMode>,
    ])
    runInAction(() => {
      this.remoteDevices = catalog.remoteDevices
      if (
        !this.screenshotPaneWeightDirty &&
        typeof screenshotPaneWeight === 'number' &&
        Number.isFinite(screenshotPaneWeight)
      ) {
        this.screenshotPaneWeight = clampScreenshotPaneWeight(
          screenshotPaneWeight
        )
      }
      this.deviceMetadata = catalog.deviceMetadata
      if (viewMode === 'table' || viewMode === 'card') {
        this.viewMode = viewMode
      }
    })

    const devices: IDevice[] = await main.getMemStore('devices')
    this.updateDevices(devices || [], false)
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
    if (device) {
      const endpoint = parseRemoteDeviceId(device.id)
      if (endpoint) {
        this.ip = endpoint.ip
        this.port = String(endpoint.port)
      }
    }
    this.device = device
    this.screenshot = device ? this.screenshots[device.id]?.image || null : null
    if (device) {
      void this.loadCachedScreenshot(device, true, true)
    }
  }
  updateDevices(devices: IDevice[], persistCatalog = true) {
    const previousOnline = new Map(
      this.getAllDevices().map((device) => [
        getNormalizedDeviceId(device.id),
        isDeviceOnline(device),
      ])
    )
    const previousDeviceMetadata = toJS(this.deviceMetadata)
    const deviceMetadata = { ...previousDeviceMetadata }
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
    let metadataPatch: Record<string, IDeviceMetadata> | undefined
    if (metadataChanged) {
      this.deviceMetadata = deviceMetadata
      metadataPatch = Object.fromEntries(
        Object.entries(deviceMetadata).filter(([key, value]) => {
          const previous = previousDeviceMetadata[key]
          return (
            !previous ||
            previous.deviceName !== value.deviceName ||
            previous.remark !== value.remark
          )
        })
      )
    }
    if (persistCatalog) {
      void main.mergeDeviceCatalog(toJS(remoteDevices), metadataPatch)
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

    const deviceConnections = { ...this.deviceConnections }
    let deviceConnectionsChanged = false
    each(this.getAllDevices(), (device) => {
      const id = getNormalizedDeviceId(device.id)
      if (
        isDeviceOnline(device) &&
        (deviceConnections[id]?.phase === 'failed' ||
          deviceConnections[id]?.phase === 'verificationFailed')
      ) {
        delete deviceConnections[id]
        deviceConnectionsChanged = true
      }
    })
    if (deviceConnectionsChanged) {
      this.deviceConnections = deviceConnections
    }
    this.initializeCachedScreenshots(this.getAllDevices())
  }
  removeRemoteDevice(id: string) {
    this.catalogRequest += 1
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
    if (this.deviceConnections[id]) {
      const deviceConnections = { ...this.deviceConnections }
      delete deviceConnections[id]
      this.deviceConnections = deviceConnections
    }
    void main.removeDeviceCatalogEntry(id)
    if (device) {
      const key = getDeviceMetadataKey(device)
      const deviceMetadata = { ...toJS(this.deviceMetadata) }
      delete deviceMetadata[key]
      this.deviceMetadata = deviceMetadata
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
    this.catalogRequest += 1
    const key = getDeviceMetadataKey(device)
    this.deviceMetadata = {
      ...toJS(this.deviceMetadata),
      [key]: {
        deviceName: deviceName.trim(),
        remark: remark.trim(),
      },
    }
    void main.setDeviceCatalogMetadata(
      { id: device.id, serialno: device.serialno },
      deviceName,
      remark
    )
  }
  importDevices(rows: IDeviceCsvRow[]) {
    this.catalogRequest += 1
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
    void main.mergeDeviceCatalog(remoteDevices, deviceMetadata)
    this.initializeCachedScreenshots(this.getAllDevices())
  }
  getAllDevices() {
    return concat(this.devices, this.remoteDevices)
  }
  getDeviceConnection(deviceId: string) {
    return this.deviceConnections[getNormalizedDeviceId(deviceId)]
  }
  async verifyDeviceConnections(deviceIds: readonly string[]) {
    await this.whenInitialized()
    const normalizedIds = new Set(
      deviceIds.map((deviceId) => getNormalizedDeviceId(deviceId))
    )
    const devices = await this.getDevicesAfterConnection(normalizedIds)
    this.updateDevices(devices)
    // 让主窗口自行发起带请求序号的最新查询，避免跨窗口旧快照覆盖新状态。
    main.sendToWindow('main', 'refreshDevices')
    return devices
  }
  connectDevice(ip: string, port?: number): Promise<void> {
    if (this.deviceConnectionTask) {
      return this.deviceConnectionTask
    }
    if (this.deviceRefreshTask) {
      return Promise.reject(new Error('DEVICE_CONNECTION_BUSY'))
    }

    const deviceId = getConnectionDeviceId(ip, port)
    const operation = ++this.deviceConnectionOperation
    runInAction(() => {
      this.deviceConnecting = true
      this.setDeviceConnection(deviceId, {
        phase: 'connecting',
        position: 1,
        total: 1,
      })
    })

    const task = this.connectAndRefreshDevice(
      ip.trim(),
      port,
      deviceId,
      operation
    ).finally(() => {
      if (this.deviceConnectionTask === task) {
        runInAction(() => {
          this.deviceConnecting = false
        })
        this.deviceConnectionTask = null
      }
    })
    this.deviceConnectionTask = task
    return task
  }
  refreshDevices(): Promise<IDeviceRefreshResult> {
    if (this.deviceRefreshTask) {
      return this.deviceRefreshTask
    }
    if (this.deviceConnectionTask) {
      return Promise.reject(new Error('DEVICE_CONNECTION_BUSY'))
    }

    runInAction(() => {
      this.devicesRefreshing = true
      this.deviceRefreshProgress = {
        completed: 0,
        total: 0,
      }
    })
    const task = this.reconnectAndRefreshDevices().finally(() => {
      runInAction(() => {
        this.devicesRefreshing = false
      })
      if (this.deviceRefreshTask === task) {
        this.deviceRefreshTask = null
      }
    })
    this.deviceRefreshTask = task
    return task
  }
  private async reconnectAndRefreshDevices(): Promise<IDeviceRefreshResult> {
    await this.whenInitialized()

    const endpoints = new Map<string, { ip: string; port: number }>()
    each(toJS(this.remoteDevices), (device) => {
      const endpoint = parseRemoteDeviceId(device.id)
      if (!endpoint) {
        return
      }
      endpoints.set(`${endpoint.ip}:${endpoint.port}`, endpoint)
    })
    const endpointList = Array.from(endpoints.values())
    const operation = ++this.deviceConnectionOperation

    runInAction(() => {
      this.deviceConnections = Object.fromEntries(
        endpointList.map(({ ip, port }, index) => [
          getConnectionDeviceId(ip, port),
          {
            phase: 'waiting' as const,
            position: index + 1,
            total: endpointList.length,
          },
        ])
      )
      this.deviceRefreshProgress = {
        completed: 0,
        total: endpointList.length,
      }
    })

    try {
      await mapWithConcurrency(
        endpointList,
        3,
        async ({ ip, port }) => {
          const deviceId = getConnectionDeviceId(ip, port)
          this.updateDeviceConnectionPhase(
            operation,
            deviceId,
            'connecting'
          )
          try {
            await main.connectDevice(ip, port)
            this.updateDeviceConnectionPhase(
              operation,
              deviceId,
              'verifying'
            )
            return true
          } catch {
            // ADB 连接命令失败不一定表示设备离线，最终状态仍以设备列表为准。
            this.updateDeviceConnectionPhase(
              operation,
              deviceId,
              'verifying'
            )
            return false
          } finally {
            runInAction(() => {
              if (operation !== this.deviceConnectionOperation) {
                return
              }
              this.deviceRefreshProgress = {
                completed: Math.min(
                  this.deviceRefreshProgress.completed + 1,
                  endpointList.length
                ),
                total: endpointList.length,
              }
            })
          }
        }
      )

      const devices = await this.verifyDeviceConnections(
        Array.from(endpoints.keys())
      )
      const onlineDeviceIds = new Set(
        devices
          .map((device) => normalizeRemoteDeviceId(device.id))
          .filter((id): id is string => Boolean(id))
      )
      const online = Array.from(endpoints.keys()).filter((id) =>
        onlineDeviceIds.has(id)
      ).length
      runInAction(() => {
        if (operation === this.deviceConnectionOperation) {
          const deviceConnections = { ...this.deviceConnections }
          endpointList.forEach(({ ip, port }, index) => {
            const deviceId = getConnectionDeviceId(ip, port)
            if (onlineDeviceIds.has(deviceId)) {
              delete deviceConnections[deviceId]
            } else {
              deviceConnections[deviceId] = {
                phase: 'failed',
                position: index + 1,
                total: endpointList.length,
              }
            }
          })
          this.deviceConnections = deviceConnections
        }
      })
      return {
        total: endpoints.size,
        online,
        offline: endpoints.size - online,
      }
    } catch (error) {
      runInAction(() => {
        if (operation !== this.deviceConnectionOperation) {
          return
        }
        this.deviceConnections = Object.fromEntries(
          endpointList.map(({ ip, port }, index) => [
            getConnectionDeviceId(ip, port),
            {
              phase: 'verificationFailed' as const,
              position: index + 1,
              total: endpointList.length,
            },
          ])
        )
      })
      throw error
    }
  }
  private async connectAndRefreshDevice(
    ip: string,
    port: number | undefined,
    deviceId: string,
    operation: number
  ) {
    let connectError: unknown
    try {
      await this.whenInitialized()
    } catch (error) {
      this.updateDeviceConnectionPhase(
        operation,
        deviceId,
        'verificationFailed'
      )
      throw error
    }
    try {
      await main.connectDevice(ip, port)
    } catch (error) {
      connectError = error
    }
    this.updateDeviceConnectionPhase(operation, deviceId, 'verifying')
    let devices: IDevice[]
    try {
      devices = await this.verifyDeviceConnections([deviceId])
    } catch (error) {
      this.updateDeviceConnectionPhase(
        operation,
        deviceId,
        'verificationFailed'
      )
      throw error
    }
    const online = devices.some(
      (device) => normalizeRemoteDeviceId(device.id) === deviceId
    )
    runInAction(() => {
      if (operation !== this.deviceConnectionOperation) {
        return
      }
      if (online) {
        this.removeDeviceConnection(deviceId)
      } else {
        this.updateDeviceConnectionPhase(
          operation,
          deviceId,
          'failed'
        )
      }
    })
    if (!online) {
      throw connectError || new Error('DEVICE_CONNECTION_NOT_FOUND')
    }
  }
  private async getDevicesAfterConnection(expectedIds: Set<string>) {
    const attempts = expectedIds.size > 0 ? 4 : 1
    let bestDevices: IDevice[] | null = null
    let bestOnlineCount = -1
    let bestRevision = -1

    for (let attempt = 0; attempt < attempts; attempt++) {
      const externalRevision = this.externalDeviceRevision
      if (externalRevision !== bestRevision) {
        bestDevices = null
        bestOnlineCount = -1
        bestRevision = externalRevision
      }
      try {
        const devices = await main.getDevices()
        if (externalRevision !== this.externalDeviceRevision) {
          if (attempt < attempts - 1) {
            await sleep(250)
          }
          continue
        }
        const onlineIds = new Set(
          devices
            .map((device) => normalizeRemoteDeviceId(device.id))
            .filter((id): id is string => Boolean(id))
        )
        const onlineCount = Array.from(expectedIds).filter((deviceId) =>
          onlineIds.has(deviceId)
        ).length
        if (onlineCount >= bestOnlineCount) {
          bestDevices = devices
          bestOnlineCount = onlineCount
        }
        if (expectedIds.size === 0 || onlineCount === expectedIds.size) {
          return devices
        }
      } catch {
        // 短暂的 ADB 查询失败会在下一次有界核验中重试。
      }
      if (attempt < attempts - 1) {
        await sleep(250)
      }
    }

    if (
      bestDevices &&
      bestRevision === this.externalDeviceRevision
    ) {
      return bestDevices
    }
    throw new Error('DEVICE_VERIFICATION_FAILED')
  }
  private setDeviceConnection(
    deviceId: string,
    state: IDeviceConnectionState
  ) {
    this.deviceConnections = {
      ...this.deviceConnections,
      [deviceId]: state,
    }
  }
  private removeDeviceConnection(deviceId: string) {
    if (!this.deviceConnections[deviceId]) {
      return
    }
    const deviceConnections = { ...this.deviceConnections }
    delete deviceConnections[deviceId]
    this.deviceConnections = deviceConnections
  }
  private updateDeviceConnectionPhase(
    operation: number,
    deviceId: string,
    phase: DeviceConnectionPhase
  ) {
    runInAction(() => {
      if (operation !== this.deviceConnectionOperation) {
        return
      }
      const current = this.deviceConnections[deviceId]
      if (!current) {
        return
      }
      this.setDeviceConnection(deviceId, {
        ...current,
        phase,
      })
    })
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
  private async reloadDevicesCatalog() {
    const request = ++this.catalogRequest
    await this.whenInitialized()
    const [catalog, devices] = await Promise.all([
      main.getDeviceCatalog(),
      main.getMemStore('devices'),
    ])
    if (request !== this.catalogRequest) {
      return
    }
    runInAction(() => {
      this.remoteDevices = catalog.remoteDevices
      this.deviceMetadata = catalog.deviceMetadata
    })
    this.updateDevices(devices || [], false)
  }
  private bindEvent() {
    main.on('changeMemStore', (name, val) => {
      switch (name) {
        case 'devices':
          this.externalDeviceRevision += 1
          void this.whenInitialized().then(() => this.updateDevices(val))
          break
      }
    })
    main.on('reloadDevicesCatalog', () => {
      void this.reloadDevicesCatalog()
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
