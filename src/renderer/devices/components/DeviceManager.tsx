import LunaDataGrid from 'luna-data-grid/react'
import { observer } from 'mobx-react-lite'
import Style from './DeviceManager.module.scss'
import { t } from 'common/util'
import map from 'licia/map'
import concat from 'licia/concat'
import className from 'licia/className'
import store from '../store'
import { useRef } from 'react'
import DataGrid, { DataGridNode } from 'luna-data-grid'
import { useResizeSensor } from 'share/renderer/lib/hooks'
import { isDeviceOnline } from 'common/device'
import DeviceCards from './DeviceCards'
import {
  getDeviceSearchTokens,
  matchesDeviceSearch,
} from '../lib/search'
import { getDeviceConnectionPresentation } from '../lib/connectionStatus'
import type {
  DeviceConnectionPhase,
  IDeviceConnectionState,
} from '../store'

export default observer(function DeviceManager() {
  const containerRef = useRef<HTMLDivElement>(null)
  const dataGridRef = useRef<DataGrid>(null)

  useResizeSensor(containerRef, () => {
    if (store.viewMode !== 'card') {
      dataGridRef.current?.fit()
    }
  })

  const searchTokens = getDeviceSearchTokens(store.filter)
  const matchingDeviceIds = new Set<string>()
  const devices = map(concat(store.devices, store.remoteDevices), (device) => {
    const metadata = store.getDeviceMetadata(device)
    if (matchesDeviceSearch(device, metadata, searchTokens)) {
      matchingDeviceIds.add(device.id)
    }
    return {
      id: device.id,
      model: device.name,
      deviceName: metadata.deviceName,
      remark: metadata.remark,
      serialno: device.serialno,
      androidVersion: device.androidVersion
        ? `Android ${device.androidVersion}${device.sdkVersion ? ` (API ${device.sdkVersion})` : ''}`
        : '',
      status: createStatusTag(
        isDeviceOnline(device),
        store.getDeviceConnection(device.id)
      ),
      type: device.type,
    }
  })
  const dataGridFilter = searchTokens.length
    ? (node: DataGridNode) =>
        matchingDeviceIds.has(node.data.id as string)
    : ''

  return (
    <div
      id="device-manager-list"
      ref={containerRef}
      className={Style.container}
    >
      {store.viewMode === 'card' ? (
        <DeviceCards />
      ) : (
        <>
          <LunaDataGrid
            className={Style.devices}
            onSelect={(node) => store.selectDevice(node.data.id as string)}
            onDeselect={() => store.selectDevice(null)}
            columns={columns}
            data={devices}
            selectable={true}
            filter={dataGridFilter}
            onDoubleClick={(e, node) => {
              if (
                node.data.type === 'device' ||
                node.data.type === 'emulator'
              ) {
                main.sendToWindow('main', 'selectDevice', node.data.id)
              }
            }}
            uniqueId="id"
            onCreate={(dataGrid) => {
              dataGridRef.current = dataGrid
              dataGrid.fit()
            }}
          />
          {devices.length === 0 ||
          (searchTokens.length > 0 && matchingDeviceIds.size === 0) ? (
            <div className={Style.tableEmpty} role="status">
              <span
                className={className('icon-phone', Style.cardEmptyIcon)}
                aria-hidden="true"
              />
              <span>
                {devices.length === 0
                  ? t('deviceNotConnected')
                  : t('noMatchingDevices')}
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
})

const columns = [
  {
    id: 'id',
    title: 'ID',
    sortable: true,
    weight: 15,
  },
  {
    id: 'serialno',
    title: t('serialno'),
    sortable: true,
    weight: 15,
  },
  {
    id: 'model',
    title: t('model'),
    sortable: true,
    weight: 18,
  },
  {
    id: 'deviceName',
    title: t('deviceName'),
    sortable: true,
    weight: 15,
  },
  {
    id: 'remark',
    title: t('remark'),
    sortable: true,
    weight: 16,
  },
  {
    id: 'androidVersion',
    title: t('androidVersion'),
    sortable: true,
    weight: 18,
  },
  {
    id: 'status',
    title: t('status'),
    sortable: true,
    weight: 12,
  },
]

function createStatusTag(
  online: boolean,
  connection?: IDeviceConnectionState
) {
  const tag = document.createElement('span')
  if (!connection) {
    tag.className = `${Style.statusTag} ${Style.tableStatusTag} ${
      online ? Style.statusOnline : Style.statusOffline
    }`
    tag.textContent = online ? t('online') : t('offline')
    return tag
  }

  const presentation = getDeviceConnectionPresentation(connection)
  tag.className = `${Style.statusTag} ${Style.tableStatusTag} ${Style.statusConnection} ${getConnectionPhaseClass(connection.phase)}`
  tag.title = presentation.title
  tag.setAttribute('aria-label', presentation.title)
  if (presentation.pending) {
    tag.setAttribute('aria-busy', 'true')
  }
  if (presentation.pending && connection.phase !== 'waiting') {
    const spinner = document.createElement('span')
    spinner.className = Style.connectionSpinner
    spinner.setAttribute('aria-hidden', 'true')
    tag.appendChild(spinner)
  }
  tag.appendChild(document.createTextNode(presentation.compactLabel))
  return tag
}

function getConnectionPhaseClass(phase: DeviceConnectionPhase) {
  switch (phase) {
    case 'waiting':
      return Style.statusWaiting
    case 'connecting':
      return Style.statusConnecting
    case 'verifying':
      return Style.statusVerifying
    case 'failed':
      return Style.statusFailed
    case 'verificationFailed':
      return Style.statusVerificationFailed
  }
}
