import { observer } from 'mobx-react-lite'
import LunaToolbar, {
  LunaToolbarButton,
  LunaToolbarHtml,
  LunaToolbarInput,
  LunaToolbarSeparator,
  LunaToolbarSpace,
} from 'luna-toolbar/react'
import Style from './Toolbar.module.scss'
import toNum from 'licia/toNum'
import isStrBlank from 'licia/isStrBlank'
import { t } from 'common/util'
import { notify } from 'share/renderer/lib/util'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import store from '../store'
import { isRemoteDevice, parseRemoteDeviceId } from '../lib/util'
import some from 'licia/some'
import CodePairModal from './CodePairModal'
import { useRef, useState } from 'react'
import DeviceEditModal from './DeviceEditModal'
import { parseDevicesCsv, stringifyDevicesCsv } from '../lib/csv'
import map from 'licia/map'
import { IDeviceCsvRow } from 'common/types'
import { isDeviceOnline } from 'common/device'

export default observer(function Toolbar() {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [codePairModalVisible, setCodePairModalVisible] = useState(false)
  const [deviceEditModalVisible, setDeviceEditModalVisible] = useState(false)
  const { device, remoteDevices } = store

  const wirelessDisabled =
    !device ||
    isRemoteDevice(device.id) ||
    some(remoteDevices, (d) => {
      return d.serialno === device.serialno && d.type !== 'offline'
    })
  const hasOnlineDevices = some(store.getAllDevices(), (device) =>
    isDeviceOnline(device)
  )
  const clearFilter = () => {
    store.setFilter('')
    searchInputRef.current?.focus()
  }

  return (
    <>
      <LunaToolbar className={Style.container}>
        <LunaToolbarInput
          keyName="ip"
          className={Style.ip}
          placeholder={t('ipAddress')}
          value={store.ip}
          onChange={(val) => store.setIp(val)}
        />
        <LunaToolbarInput
          keyName="port"
          className={Style.port}
          placeholder={t('port')}
          value={store.port}
          onChange={(val) => store.setPort(val)}
        />
        <LunaToolbarButton
          onClick={async () => {
            try {
              if (store.port) {
                await main.connectDevice(store.ip, toNum(store.port))
              } else {
                await main.connectDevice(store.ip)
              }
            } catch {
              notify(t('connectErr'), { icon: 'error' })
            }
          }}
          state="hover"
          disabled={isStrBlank(store.ip)}
        >
          {t('connect')}
        </LunaToolbarButton>
        <LunaToolbarSeparator />
        <LunaToolbarButton
          onClick={() => setCodePairModalVisible(true)}
          state="hover"
        >
          {t('pair')}
        </LunaToolbarButton>
        <LunaToolbarSpace />
        <ToolbarIcon
          icon="wifi"
          title={t('wirelessMode')}
          disabled={wirelessDisabled}
          onClick={async () => {
            if (device) {
              try {
                await main.startWireless(device.id)
              } catch {
                notify(t('commonErr'), { icon: 'error' })
              }
            }
          }}
        />
        <ToolbarIcon
          icon="disconnect"
          title={t('disconnect')}
          disabled={
            !device || !isRemoteDevice(device.id) || device.type === 'offline'
          }
          onClick={async () => {
            if (device) {
              const [ip, port] = device.id.split(':')
              if (port) {
                await main.disconnectDevice(ip, toNum(port))
              } else {
                await main.disconnectDevice(ip)
              }
            }
          }}
        />
        <ToolbarIcon
          icon="delete"
          title={t('delete')}
          disabled={
            !device || !isRemoteDevice(device.id) || device.type !== 'offline'
          }
          onClick={async () => {
            if (device) {
              store.removeRemoteDevice(device.id)
            }
          }}
        />
        <LunaToolbarSeparator />
        <LunaToolbarButton
          state="hover"
          disabled={!device}
          onClick={() => setDeviceEditModalVisible(true)}
        >
          {t('edit')}
        </LunaToolbarButton>
        <ToolbarIcon
          icon="open-file"
          title={t('importCsv')}
          onClick={async () => {
            try {
              const content = await main.importDevicesCsv()
              if (content === null) {
                return
              }
              await store.whenInitialized()
              const rows = parseDevicesCsv(content)
              store.importDevices(rows)
              const connections = await connectImportedDevices(rows)
              notify(
                connections.total > 0
                  ? t('devicesImportedWithConnections', {
                      count: rows.length,
                      connected: connections.connected,
                      failed: connections.failed,
                    })
                  : t('devicesImported', { count: rows.length }),
                {
                  icon: connections.failed > 0 ? 'warning' : 'success',
                }
              )
            } catch (error) {
              notify(getCsvImportErrorMessage(error), { icon: 'error' })
            }
          }}
        />
        <ToolbarIcon
          icon="save"
          title={t('exportCsv')}
          disabled={store.getAllDevices().length === 0}
          onClick={async () => {
            try {
              await store.whenInitialized()
              const devices = map(store.getAllDevices(), (device) => ({
                ...device,
                metadata: store.getDeviceMetadata(device),
                status: device.type === 'offline' ? t('offline') : t('online'),
              }))
              const content = stringifyDevicesCsv(devices, [
                '设备名称',
                'IP地址',
                '端口',
                '备注',
                'ID',
                '序列号',
                '型号',
                'Android版本',
                'SDK版本',
                '状态',
              ])
              const filePath = await main.exportDevicesCsv(content)
              if (filePath) {
                notify(t('devicesExported', { path: filePath }), {
                  icon: 'success',
                })
              }
            } catch {
              notify(t('csvExportErr'), { icon: 'error' })
            }
          }}
        />
        <LunaToolbarSeparator />
        <LunaToolbarHtml className={Style.search}>
          <input
            id="device-manager-search"
            ref={searchInputRef}
            type="search"
            value={store.filter}
            placeholder={t('searchDeviceShort')}
            title={t('searchDevice')}
            aria-label={t('searchDevice')}
            aria-controls="device-manager-list"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => store.setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Escape' &&
                !event.nativeEvent.isComposing &&
                store.filter
              ) {
                event.preventDefault()
                clearFilter()
              }
            }}
          />
          <button
            type="button"
            className={Style.searchClear}
            title={t('clear')}
            aria-label={t('clear')}
            disabled={!store.filter}
            onClick={clearFilter}
          >
            <span className="icon-clear" aria-hidden="true" />
          </button>
        </LunaToolbarHtml>
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="grid"
          title={t('cardView')}
          state={store.viewMode === 'card' ? 'hover' : ''}
          onClick={() => store.setViewMode('card')}
        />
        <ToolbarIcon
          icon="list"
          title={t('listView')}
          state={store.viewMode === 'table' ? 'hover' : ''}
          onClick={() => store.setViewMode('table')}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="camera"
          title={t(
            store.screenshotsRefreshing
              ? 'updatingScreenshots'
              : 'batchUpdateScreenshots'
          )}
          disabled={store.screenshotsRefreshing || !hasOnlineDevices}
          onClick={async () => {
            try {
              const result = await store.refreshAllScreenshots()
              let icon: 'success' | 'warning' | 'error' = 'success'
              if (result.failed > 0 && result.success === 0) {
                icon = 'error'
              } else if (result.failed > 0 || result.skipped > 0) {
                icon = 'warning'
              }
              notify(t('screenshotsRefreshResult', result), { icon })
            } catch {
              notify(t('screenshotFailed'), { icon: 'error' })
            }
          }}
        />
        <ToolbarIcon
          icon="refresh"
          title={t('refresh')}
          onClick={async () => {
            main.sendToWindow('main', 'refreshDevices')
            notify(t('deviceRefreshed'), { icon: 'success' })
          }}
        />
      </LunaToolbar>
      <CodePairModal
        visible={codePairModalVisible}
        onClose={() => setCodePairModalVisible(false)}
      />
      <DeviceEditModal
        device={device}
        visible={deviceEditModalVisible}
        onClose={() => setDeviceEditModalVisible(false)}
      />
    </>
  )
})

async function connectImportedDevices(rows: IDeviceCsvRow[]) {
  const endpoints = new Map<string, { ip: string; port: number }>()
  for (const row of rows) {
    const endpoint = parseRemoteDeviceId(row.id)
    if (!endpoint) {
      continue
    }
    endpoints.set(`${endpoint.ip}:${endpoint.port}`, endpoint)
  }

  const results = await Promise.allSettled(
    Array.from(endpoints.values()).map(({ ip, port }) =>
      main.connectDevice(ip, port)
    )
  )
  const connected = results.filter((result) => result.status === 'fulfilled')
    .length
  if (connected > 0) {
    try {
      store.updateDevices(await main.getDevices())
    } catch {
      // The main window refresh below will retry field discovery via ADB.
    }
    main.sendToWindow('main', 'refreshDevices')
  }
  return {
    total: endpoints.size,
    connected,
    failed: endpoints.size - connected,
  }
}

function getCsvImportErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return t('csvImportErr')
  }
  switch (error.message) {
    case 'CSV_NETWORK_HEADERS_REQUIRED':
      return t('csvNetworkHeadersRequired')
    case 'CSV_INVALID_NETWORK_ADDRESS':
      return t('csvInvalidNetworkAddress')
    case 'CSV_ID_HEADER_REQUIRED':
      return t('csvIdHeaderRequired')
    default:
      return t('csvImportErr')
  }
}
