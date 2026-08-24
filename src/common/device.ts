import type { IDevice } from './types'

export function getDeviceMetadataKey(
  device: Pick<IDevice, 'id' | 'serialno'>
) {
  return device.serialno ? `serial:${device.serialno}` : `id:${device.id}`
}

export function isDeviceOnline(device: Pick<IDevice, 'type'>) {
  return device.type === 'device' || device.type === 'emulator'
}

export function getDeviceDisplayName(
  device: Pick<IDevice, 'id' | 'name' | 'deviceName'>
) {
  return device.deviceName?.trim() || device.name?.trim() || device.id
}
