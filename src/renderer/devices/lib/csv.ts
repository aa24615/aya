import { IDevice, IDeviceCsvRow, IDeviceMetadata } from 'common/types'
import isIp from 'licia/isIp'
import {
  normalizeRemoteDeviceId,
  parseRemoteDeviceId,
} from './util'

interface IExportDevice extends IDevice {
  metadata: IDeviceMetadata
  status: string
}

const headerAliases: Record<keyof IDeviceCsvRow, string[]> = {
  id: ['id', 'deviceid', '设备id', '设备编号'],
  serialno: [
    'serialno',
    'serialnumber',
    '序列号',
    '序列號',
    'الرقم التسلسلي',
    '´No. serie',
    'Numéro de série',
    'Número de Série',
    'Серийный номер',
    'Seri Numarası',
  ],
  model: ['model', '型号', '型號', 'نموذج', 'Modelo', 'Modèle', 'Модель'],
  deviceName: ['devicename', '设备名称', '設備名稱'],
  remark: ['remark', 'remarks', 'note', 'notes', '备注', '備註'],
  androidVersion: [
    'androidversion',
    'android版本',
    'اصدار الاندرويد',
    'Versión de Android',
    'Version Android',
    'Versão do Android',
    'Версия Android',
    'Android Sürümü',
  ],
  sdkVersion: [
    'sdkversion',
    'sdk版本',
    'Versión de SDK',
    'Versão do SDK',
    'SDK Версия',
    'SDK Sürümü',
  ],
}

const networkHeaderAliases = {
  ip: ['ip', 'ipaddress', 'ip地址'],
  port: ['port', '端口'],
}

const systemFieldKeys: (keyof IDeviceCsvRow)[] = [
  'serialno',
  'model',
  'androidVersion',
  'sdkVersion',
]

export function parseDevicesCsv(content: string): IDeviceCsvRow[] {
  const rows = parseCsv(content.replace(/^\uFEFF/, ''))
  if (rows.length === 0) {
    return []
  }

  const headers = rows[0].map(normalizeHeader)
  const indexes = {} as Record<keyof IDeviceCsvRow, number>
  for (const key of Object.keys(headerAliases) as (keyof IDeviceCsvRow)[]) {
    indexes[key] = findHeaderIndex(headers, headerAliases[key])
  }
  const ipIndex = findHeaderIndex(headers, networkHeaderAliases.ip)
  const portIndex = findHeaderIndex(headers, networkHeaderAliases.port)
  const hasIpColumn = ipIndex >= 0
  const hasPortColumn = portIndex >= 0
  if (hasIpColumn !== hasPortColumn) {
    throw new Error('CSV_NETWORK_HEADERS_REQUIRED')
  }
  if (
    indexes.id < 0 &&
    (indexes.deviceName < 0 ||
      !hasIpColumn ||
      indexes.remark < 0)
  ) {
    throw new Error('CSV_NETWORK_HEADERS_REQUIRED')
  }

  const devices = new Map<string, IDeviceCsvRow>()
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index]
    if (row.every((cell) => !cell.trim())) {
      continue
    }

    const importedId = restoreSpreadsheetCell(getCell(row, indexes.id))
    let id = importedId
    if (hasIpColumn) {
      const ip = restoreSpreadsheetCell(getCell(row, ipIndex))
      const port = restoreSpreadsheetCell(getCell(row, portIndex))
      if (ip || port || !importedId) {
        id = getNetworkDeviceId(ip, port)
      }
    }
    if (!id) {
      continue
    }
    id = normalizeRemoteDeviceId(id) || id

    const device: IDeviceCsvRow = { id }
    for (const key of Object.keys(indexes) as (keyof IDeviceCsvRow)[]) {
      if (key !== 'id' && indexes[key] >= 0) {
        device[key] = restoreSpreadsheetCell(getCell(row, indexes[key]))
      }
    }
    const previous = devices.get(id)
    const merged = {
      ...previous,
      ...device,
    }
    for (const key of systemFieldKeys) {
      if (!device[key] && previous?.[key]) {
        merged[key] = previous[key]
      }
    }
    devices.set(id, merged)
  }
  return Array.from(devices.values())
}

function getNetworkDeviceId(ip: string, port: string) {
  if (!isIp.v4(ip) || !/^\d+$/.test(port)) {
    throw new Error('CSV_INVALID_NETWORK_ADDRESS')
  }
  const portNumber = Number(port)
  if (portNumber < 1 || portNumber > 65535) {
    throw new Error('CSV_INVALID_NETWORK_ADDRESS')
  }
  return `${ip}:${portNumber}`
}

export function stringifyDevicesCsv(
  devices: IExportDevice[],
  headers: string[]
) {
  const rows = devices.map((device) => {
    const endpoint = parseRemoteDeviceId(device.id)
    return [
      device.metadata.deviceName,
      endpoint?.ip || '',
      endpoint ? String(endpoint.port) : '',
      device.metadata.remark,
      device.id,
      device.serialno,
      device.name,
      device.androidVersion,
      device.sdkVersion,
      device.status,
    ]
  })
  return `\uFEFF${[headers, ...rows].map(stringifyRow).join('\r\n')}\r\n`
}

function parseCsv(content: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < content.length; index++) {
    const char = content[index]
    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"'
          index++
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') {
        index++
      }
      row.push(cell)
      if (row.some((value) => value !== '')) {
        rows.push(row)
      }
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (quoted) {
    throw new Error('CSV_INVALID_FORMAT')
  }
  row.push(cell)
  if (row.some((value) => value !== '')) {
    rows.push(row)
  }
  return rows
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader)
  return headers.findIndex((header) => normalizedAliases.includes(header))
}

function getCell(row: string[], index: number) {
  return (row[index] || '').trim()
}

function stringifyRow(row: string[]) {
  return row
    .map((cell) => stringifyCell(protectSpreadsheetCell(cell)))
    .join(',')
}

function stringifyCell(cell: string) {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

function protectSpreadsheetCell(cell: string) {
  return /^[=+\-@]/.test(cell) ? `'${cell}` : cell
}

function restoreSpreadsheetCell(cell: string) {
  return /^'[=+\-@]/.test(cell) ? cell.slice(1) : cell
}
