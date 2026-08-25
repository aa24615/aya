import {
  normalizeRemoteDeviceId,
  parseRemoteDeviceId,
  type IRemoteDeviceEndpoint,
} from './device'
import { isMainPanel, type MainPanel } from './mainPanel'
import type { IDevice } from './types'

export const AYA_URL_SCHEME = 'aya'
export const AYA_URL_MAX_LENGTH = 2048

export type AyaDeepLinkError =
  | 'invalid-url'
  | 'unsupported-action'
  | 'invalid-parameters'
  | 'device-required'
  | 'invalid-device'

interface IAyaDeviceTarget {
  deviceId?: string
  endpoint?: IRemoteDeviceEndpoint & { id: string }
  deviceName?: string
  remark?: string
}

export type AyaDeepLinkCommand =
  | ({ type: 'add' } & IAyaDeviceTarget & {
      endpoint: IRemoteDeviceEndpoint & { id: string }
      deviceId: string
    })
  | ({ type: 'select' } & IAyaDeviceTarget & { deviceId: string })
  | ({ type: 'screencast' } & IAyaDeviceTarget)
  | ({ type: 'panel'; panel: MainPanel } & IAyaDeviceTarget)
  | ({ type: 'open' } & IAyaDeviceTarget)
  | { type: 'devices' }

export type AyaDeepLinkParseResult =
  | { ok: true; command: AyaDeepLinkCommand }
  | { ok: false; error: AyaDeepLinkError }

export interface IAyaDeepLinkDispatch {
  command: AyaDeepLinkCommand
  devices?: IDevice[]
}

const QUERY_KEYS = new Set([
  'ip',
  'port',
  'device',
  'id',
  'name',
  'deviceName',
  'device_name',
  'remark',
  '设备',
  '设备名称',
  '备注',
])

function failure(error: AyaDeepLinkError): AyaDeepLinkParseResult {
  return { ok: false, error }
}

function decodePart(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function readSingleParam(
  params: URLSearchParams,
  keys: string[]
): string | null | undefined {
  const values: string[] = []
  for (const key of keys) {
    values.push(...params.getAll(key))
  }
  if (values.length > 1) {
    return undefined
  }
  return values.length === 1 ? values[0] : null
}

function readOptionalText(
  params: URLSearchParams,
  keys: string[],
  maxLength: number
): string | null | undefined {
  const value = readSingleParam(params, keys)
  if (value === undefined || value === null) {
    return value
  }
  if (hasControlCharacters(value)) {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    return undefined
  }
  return trimmed
}

function hasControlCharacters(value: string) {
  if (/\p{Bidi_Control}/u.test(value)) {
    return true
  }
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return (
      code <= 31 ||
      (code >= 127 && code <= 159)
    )
  })
}

function parseDeviceTarget(
  params: URLSearchParams
): IAyaDeviceTarget | AyaDeepLinkError {
  const rawDeviceId = readSingleParam(params, ['device', 'id', '设备'])
  const rawIp = readSingleParam(params, ['ip'])
  const rawPort = readSingleParam(params, ['port'])
  const deviceName = readOptionalText(
    params,
    ['name', 'deviceName', 'device_name', '设备名称'],
    100
  )
  const remark = readOptionalText(params, ['remark', '备注'], 500)

  if (
    rawDeviceId === undefined ||
    rawIp === undefined ||
    rawPort === undefined ||
    deviceName === undefined ||
    remark === undefined
  ) {
    return 'invalid-parameters'
  }

  let deviceId: string | undefined
  let endpoint: IAyaDeviceTarget['endpoint']

  if (rawDeviceId !== null) {
    const trimmed = rawDeviceId.trim()
    if (
      !trimmed ||
      trimmed !== rawDeviceId ||
      trimmed.length > 255 ||
      hasControlCharacters(trimmed) ||
      trimmed.includes('/') ||
      trimmed.includes('\\')
    ) {
      return 'invalid-device'
    }
    const normalizedId = normalizeRemoteDeviceId(trimmed)
    deviceId = normalizedId || trimmed
    if (normalizedId) {
      const parsedEndpoint = parseRemoteDeviceId(normalizedId)!
      endpoint = { ...parsedEndpoint, id: normalizedId }
    }
  }

  if (rawIp !== null || rawPort !== null) {
    if (rawIp === null) {
      return 'invalid-device'
    }
    if (
      rawIp !== rawIp.trim() ||
      hasControlCharacters(rawIp) ||
      (rawPort !== null &&
        (rawPort !== rawPort.trim() || hasControlCharacters(rawPort)))
    ) {
      return 'invalid-device'
    }
    const port = rawPort === null || rawPort === '' ? '5555' : rawPort
    const normalizedId = normalizeRemoteDeviceId(`${rawIp}:${port}`)
    if (!normalizedId) {
      return 'invalid-device'
    }
    if (deviceId && deviceId !== normalizedId) {
      return 'invalid-parameters'
    }
    const parsedEndpoint = parseRemoteDeviceId(normalizedId)!
    deviceId = normalizedId
    endpoint = { ...parsedEndpoint, id: normalizedId }
  }

  if ((deviceName !== null || remark !== null) && !endpoint) {
    return 'invalid-parameters'
  }

  return {
    deviceId,
    endpoint,
    ...(deviceName !== null ? { deviceName } : {}),
    ...(remark !== null ? { remark } : {}),
  }
}

function getRoute(url: URL) {
  const host = decodePart(url.hostname)
  if (host === null) {
    return null
  }
  const pathParts: string[] = []
  for (const rawPart of url.pathname.split('/').filter(Boolean)) {
    const part = decodePart(rawPart)
    if (part === null) {
      return null
    }
    pathParts.push(part)
  }
  return [host, ...pathParts].filter(Boolean).join('/').toLowerCase()
}

function hasInvalidRawPath(rawUrl: string) {
  const schemeEnd = rawUrl.indexOf('://')
  if (schemeEnd < 0) {
    return false
  }
  const pathStart = rawUrl.indexOf('/', schemeEnd + 3)
  if (pathStart < 0) {
    return false
  }
  const queryStart = rawUrl.search(/[?#]/)
  if (queryStart >= 0 && pathStart > queryStart) {
    return false
  }
  const rawPath = rawUrl.slice(pathStart).split(/[?#]/, 1)[0]
  if (rawPath.includes('//')) {
    return true
  }
  return rawPath.split('/').some((segment) => {
    const decoded = decodePart(segment)
    return decoded === '.' || decoded === '..'
  })
}

function hasInvalidEncoding(rawUrl: string) {
  try {
    decodeURIComponent(rawUrl.replace(/\+/g, '%20'))
    return false
  } catch {
    return true
  }
}

export function parseAyaDeepLink(rawUrl: string): AyaDeepLinkParseResult {
  if (
    !rawUrl ||
    rawUrl.length > AYA_URL_MAX_LENGTH ||
    hasControlCharacters(rawUrl) ||
    hasInvalidRawPath(rawUrl) ||
    hasInvalidEncoding(rawUrl)
  ) {
    return failure('invalid-url')
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return failure('invalid-url')
  }

  if (
    url.protocol !== `${AYA_URL_SCHEME}:` ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    return failure('invalid-url')
  }
  for (const key of url.searchParams.keys()) {
    if (!QUERY_KEYS.has(key)) {
      return failure('invalid-parameters')
    }
  }

  const route = getRoute(url)
  if (route === null) {
    return failure('invalid-url')
  }

  if (
    route === 'devices' ||
    route === 'device-manager' ||
    route === 'list' ||
    route === '设备管理' ||
    route === '设备列表'
  ) {
    return url.search ? failure('invalid-parameters') : { ok: true, command: { type: 'devices' } }
  }

  const target = parseDeviceTarget(url.searchParams)
  if (typeof target === 'string') {
    return failure(target)
  }

  if (
    route === 'list/add' ||
    route === 'device/add' ||
    route === 'add' ||
    route === '列表/添加' ||
    route === '设备/添加' ||
    route === '导入设备'
  ) {
    if (!target.endpoint || !target.deviceId) {
      return failure('device-required')
    }
    return { ok: true, command: { type: 'add', ...target } as AyaDeepLinkCommand }
  }

  if (
    route === 'device/select' ||
    route === 'select' ||
    route === 'switch' ||
    route === '设备/选择' ||
    route === '选中' ||
    route === '切换设备'
  ) {
    if (!target.deviceId) {
      return failure('device-required')
    }
    return { ok: true, command: { type: 'select', ...target } as AyaDeepLinkCommand }
  }

  if (
    route === 'screencast' ||
    route === 'cast' ||
    route === 'screen' ||
    route === '投屏'
  ) {
    return { ok: true, command: { type: 'screencast', ...target } }
  }

  if (route === 'open') {
    return { ok: true, command: { type: 'open', ...target } }
  }

  let panel: string | undefined
  if (route === 'main') {
    panel = 'overview'
  } else if (route.startsWith('main/')) {
    panel = route.slice('main/'.length)
  } else if (route.startsWith('panel/')) {
    panel = route.slice('panel/'.length)
  } else if (isMainPanel(route)) {
    panel = route
  }
  if (isMainPanel(panel)) {
    return {
      ok: true,
      command: { type: 'panel', panel, ...target },
    }
  }

  return failure('unsupported-action')
}
