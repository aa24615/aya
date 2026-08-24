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

/**
 * 返回设备截图的稳定缓存键。无线 ADB 设备按 IP 共享一张缓存图，
 * USB 与模拟器则使用经过文件名安全编码的原始设备 ID。
 */
export function getDeviceScreenshotCacheKey(deviceId: string) {
  const remoteMatch = deviceId.match(
    /^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/
  )
  if (remoteMatch) {
    const validIp = remoteMatch[1]
      .split('.')
      .every((part) => Number(part) >= 0 && Number(part) <= 255)
    const port = Number(remoteMatch[2])
    if (validIp && port >= 1 && port <= 65535) {
      return remoteMatch[1]
    }
  }

  const encodedId = encodeURIComponent(deviceId || 'unknown').replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
  let hash = 2166136261
  for (let i = 0; i < deviceId.length; i++) {
    hash ^= deviceId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const hashSuffix = (hash >>> 0).toString(16)

  // 哈希后缀同时避免大小写不敏感文件系统中的设备 ID 冲突。
  return `device-${encodedId.slice(0, 165)}-${hashSuffix}`
}
