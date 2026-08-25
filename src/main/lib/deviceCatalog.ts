import type {
  IDevice,
  IDeviceCatalogSnapshot,
  IDeviceMetadata,
} from 'common/types'
import {
  getDeviceMetadataKeys,
  normalizeRemoteDeviceId,
} from 'common/device'
import { getDevicesStore } from './store'

interface IRemoteEndpointInput {
  id: string
  deviceName?: string
  remark?: string
}

const store = getDevicesStore()

function cloneRemoteDevices() {
  return ((store.get('remoteDevices') || []) as IDevice[]).map((device) => ({
    ...device,
  }))
}

function cloneDeviceMetadata() {
  return {
    ...((store.get('deviceMetadata') || {}) as Record<
      string,
      IDeviceMetadata
    >),
  }
}

function mergeDuplicateRemoteDevices(devices: IDevice[]) {
  const merged = new Map<string, IDevice>()
  for (const device of devices) {
    const existing = merged.get(device.id)
    if (!existing) {
      merged.set(device.id, { ...device })
      continue
    }
    const sourceIsOnline =
      device.type === 'device' || device.type === 'emulator'
    if (sourceIsOnline) {
      Object.assign(existing, device)
    } else {
      existing.name ||= device.name
      existing.serialno ||= device.serialno
      existing.androidVersion ||= device.androidVersion
      existing.sdkVersion ||= device.sdkVersion
    }
  }
  return Array.from(merged.values())
}

function saveRemoteDevices(snapshot: IDeviceCatalogSnapshot) {
  store.set('remoteDevices', snapshot.remoteDevices)
}

function saveSnapshot(snapshot: IDeviceCatalogSnapshot) {
  store.set('remoteDevices', snapshot.remoteDevices)
  store.set('deviceMetadata', snapshot.deviceMetadata)
}

export function getDeviceCatalogSnapshot(): IDeviceCatalogSnapshot {
  const deviceMetadata = cloneDeviceMetadata()
  let remoteDevicesChanged = false
  let deviceMetadataChanged = false
  const normalizedDevices = cloneRemoteDevices().map((device) => {
    const normalizedId = normalizeRemoteDeviceId(device.id) || device.id
    if (normalizedId === device.id) {
      return device
    }
    remoteDevicesChanged = true
    const legacyKey = `id:${device.id}`
    const normalizedKey = `id:${normalizedId}`
    if (deviceMetadata[legacyKey]) {
      deviceMetadata[normalizedKey] ||= deviceMetadata[legacyKey]
      delete deviceMetadata[legacyKey]
      deviceMetadataChanged = true
    }
    return { ...device, id: normalizedId }
  })
  const remoteDevices = mergeDuplicateRemoteDevices(normalizedDevices)
  if (remoteDevices.length !== normalizedDevices.length) {
    remoteDevicesChanged = true
  }
  if (remoteDevicesChanged) {
    store.set('remoteDevices', remoteDevices)
  }
  if (deviceMetadataChanged) {
    store.set('deviceMetadata', deviceMetadata)
  }
  return { remoteDevices, deviceMetadata }
}

export function upsertRemoteEndpoint(
  input: IRemoteEndpointInput
): IDeviceCatalogSnapshot {
  const id = normalizeRemoteDeviceId(input.id)
  if (!id) {
    throw new Error('Invalid remote device endpoint')
  }

  const snapshot = getDeviceCatalogSnapshot()
  let device = snapshot.remoteDevices.find((item) => item.id === id)
  if (!device) {
    device = {
      id,
      name: '',
      serialno: '',
      androidVersion: '',
      sdkVersion: '',
      type: 'offline',
    }
    snapshot.remoteDevices.push(device)
  }

  if (input.deviceName !== undefined || input.remark !== undefined) {
    const idKey = `id:${id}`
    const current =
      getDeviceMetadataKeys(device)
        .map((key) => snapshot.deviceMetadata[key])
        .find(Boolean) || { deviceName: '', remark: '' }
    snapshot.deviceMetadata[idKey] = {
      deviceName:
        input.deviceName === undefined
          ? current.deviceName
          : input.deviceName,
      remark: input.remark === undefined ? current.remark : input.remark,
    }
    store.set('deviceMetadata', snapshot.deviceMetadata)
  }

  saveRemoteDevices(snapshot)
  return snapshot
}

export function mergeDeviceCatalog(
  remoteDevices: IDevice[],
  deviceMetadata: Record<string, IDeviceMetadata> = {}
): IDeviceCatalogSnapshot {
  const snapshot = getDeviceCatalogSnapshot()
  const normalizedIncoming = remoteDevices
    .map((device) => {
      const id = normalizeRemoteDeviceId(device.id)
      return id ? { ...device, id } : null
    })
    .filter((device): device is IDevice => Boolean(device))
  const remoteDevicesById = new Map(
    snapshot.remoteDevices.map((device) => [device.id, device])
  )
  for (const device of mergeDuplicateRemoteDevices(normalizedIncoming)) {
    // The supplied endpoints are the latest renderer snapshot. Replace those
    // entries (including an online -> offline transition), while preserving
    // endpoints that may have been added concurrently by a URL Scheme action.
    remoteDevicesById.set(device.id, device)
  }
  snapshot.remoteDevices = Array.from(remoteDevicesById.values())
  snapshot.deviceMetadata = {
    ...snapshot.deviceMetadata,
    ...deviceMetadata,
  }
  saveRemoteDevices(snapshot)
  if (Object.keys(deviceMetadata).length > 0) {
    store.set('deviceMetadata', snapshot.deviceMetadata)
  }
  return snapshot
}

export function removeDeviceCatalogEntry(
  deviceId: string
): IDeviceCatalogSnapshot {
  const id = normalizeRemoteDeviceId(deviceId)
  if (!id) {
    throw new Error('Invalid remote device endpoint')
  }
  const snapshot = getDeviceCatalogSnapshot()
  snapshot.remoteDevices = snapshot.remoteDevices.filter(
    (item) => item.id !== id
  )
  for (const key of Object.keys(snapshot.deviceMetadata)) {
    if (!key.startsWith('id:')) {
      continue
    }
    const metadataDeviceId = key.slice('id:'.length)
    if (
      metadataDeviceId === id ||
      normalizeRemoteDeviceId(metadataDeviceId) === id
    ) {
      delete snapshot.deviceMetadata[key]
    }
  }
  saveSnapshot(snapshot)
  return snapshot
}

export function setDeviceCatalogMetadata(
  device: Pick<IDevice, 'id' | 'serialno'>,
  deviceName: string,
  remark: string
): IDeviceCatalogSnapshot {
  const snapshot = getDeviceCatalogSnapshot()
  const normalizedId = normalizeRemoteDeviceId(device.id) || device.id
  const storedDevice = snapshot.remoteDevices.find(
    (item) => item.id === normalizedId
  )
  const key = getDeviceMetadataKeys(storedDevice || {
    ...device,
    id: normalizedId,
  })[0]
  snapshot.deviceMetadata[key] = {
    deviceName: deviceName.trim(),
    remark: remark.trim(),
  }
  store.set('deviceMetadata', snapshot.deviceMetadata)
  return snapshot
}

export function mergeConnectedDevices(
  devices: IDevice[]
): IDeviceCatalogSnapshot {
  const snapshot = getDeviceCatalogSnapshot()
  const onlineById = new Map<string, IDevice>()
  for (const device of devices) {
    const id = normalizeRemoteDeviceId(device.id)
    if (id) {
      onlineById.set(id, { ...device, id })
    }
  }
  snapshot.remoteDevices = snapshot.remoteDevices.map((device) => {
    const online = onlineById.get(device.id)
    return online ? online : { ...device, type: 'offline' }
  })
  saveRemoteDevices(snapshot)
  return snapshot
}
