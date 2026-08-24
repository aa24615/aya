import { IDevice, IDeviceCsvRow, IDeviceMetadata } from 'common/types'
import isIp from 'licia/isIp'

interface IExportDevice extends IDevice {
  metadata: IDeviceMetadata
  status: string
}

const headerAliases: Record<keyof IDeviceCsvRow, string[]> = {
  id: ['id', 'deviceid', '设备id', '设备编号'],
  serialno: ['serialno', 'serialnumber', '序列号'],
  model: ['model', '型号'],
  deviceName: ['devicename', '设备名称'],
  remark: ['remark', 'remarks', 'note', 'notes', '备注'],
  androidVersion: ['androidversion', 'android版本'],
  sdkVersion: ['sdkversion', 'sdk版本'],
}

const networkHeaderAliases = {
  ip: ['ip', 'ipaddress', 'ip地址'],
  port: ['port', '端口'],
}

export function parseDevicesCsv(content: string): IDeviceCsvRow[] {
  const rows = parseCsv(content.replace(/^\uFEFF/, ''))
  if (rows.length === 0) {
    return []
  }

  const headers = rows[0].map(normalizeHeader)
  const indexes = {} as Record<keyof IDeviceCsvRow, number>
  for (const key of Object.keys(headerAliases) as (keyof IDeviceCsvRow)[]) {
    indexes[key] = headers.findIndex((header) =>
      headerAliases[key].includes(header)
    )
  }
  const ipIndex = headers.findIndex((header) =>
    networkHeaderAliases.ip.includes(header)
  )
  const portIndex = headers.findIndex((header) =>
    networkHeaderAliases.port.includes(header)
  )
  const useNetworkColumns = indexes.id < 0
  if (
    useNetworkColumns &&
    (indexes.deviceName < 0 ||
      ipIndex < 0 ||
      portIndex < 0 ||
      indexes.remark < 0)
  ) {
    throw new Error('CSV_NETWORK_HEADERS_REQUIRED')
  }

  const devices: IDeviceCsvRow[] = []
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index]
    let id = restoreSpreadsheetCell(getCell(row, indexes.id))
    if (useNetworkColumns) {
      const ip = restoreSpreadsheetCell(getCell(row, ipIndex))
      const port = restoreSpreadsheetCell(getCell(row, portIndex))
      if (!ip && !port && row.every((cell) => !cell.trim())) {
        continue
      }
      id = getNetworkDeviceId(ip, port)
    } else if (!id) {
      continue
    }
    const device: IDeviceCsvRow = { id }
    for (const key of Object.keys(indexes) as (keyof IDeviceCsvRow)[]) {
      if (key !== 'id' && indexes[key] >= 0) {
        device[key] = restoreSpreadsheetCell(getCell(row, indexes[key]))
      }
    }
    devices.push(device)
  }
  return devices
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
  const rows = devices.map((device) => [
    device.id,
    device.serialno,
    device.name,
    device.metadata.deviceName,
    device.metadata.remark,
    device.androidVersion,
    device.sdkVersion,
    device.status,
  ])
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
