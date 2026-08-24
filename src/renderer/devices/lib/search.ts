import {
  getDeviceDisplayName,
  isDeviceOnline,
} from 'common/device'
import { IDevice, IDeviceMetadata } from 'common/types'
import { t } from 'common/util'

function normalizeSearchText(text: string | undefined) {
  return (text || '').normalize('NFKC').toLowerCase()
}

export function getDeviceSearchTokens(search: string) {
  return normalizeSearchText(search)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function matchesDeviceSearch(
  device: IDevice,
  metadata: IDeviceMetadata,
  tokens: readonly string[]
) {
  if (tokens.length === 0) {
    return true
  }

  const online = isDeviceOnline(device)
  const androidVersion = device.androidVersion
    ? `Android ${device.androidVersion}${
        device.sdkVersion ? ` (API ${device.sdkVersion})` : ''
      }`
    : ''
  const values = [
    getDeviceDisplayName({
      ...device,
      deviceName: metadata.deviceName,
    }),
    metadata.deviceName,
    device.name,
    device.id,
    device.serialno,
    metadata.remark,
    androidVersion,
    online ? t('online') : t('offline'),
    online ? 'online' : 'offline',
  ].map(normalizeSearchText)

  return tokens.every((token) =>
    values.some((value) => value.includes(token))
  )
}
