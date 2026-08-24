import isIp from 'licia/isIp'

export function isRemoteDevice(deviceId: string) {
  return parseRemoteDeviceId(deviceId) !== null
}

export function normalizeRemoteDeviceId(deviceId: string) {
  const endpoint = parseRemoteDeviceId(deviceId)
  return endpoint ? `${endpoint.ip}:${endpoint.port}` : null
}

export function parseRemoteDeviceId(deviceId: string) {
  const match = deviceId.match(/^([^:]+):(\d+)$/)
  if (!match || !isIp.v4(match[1])) {
    return null
  }
  const port = Number(match[2])
  if (port < 1 || port > 65535) {
    return null
  }
  return {
    ip: match[1],
    port,
  }
}
