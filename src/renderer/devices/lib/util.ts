import {
  normalizeRemoteDeviceId,
  parseRemoteDeviceId,
} from 'common/device'

export { normalizeRemoteDeviceId, parseRemoteDeviceId }

export function isRemoteDevice(deviceId: string) {
  return parseRemoteDeviceId(deviceId) !== null
}
