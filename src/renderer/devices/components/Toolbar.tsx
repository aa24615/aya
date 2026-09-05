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
import {
  isRemoteDevice,
  normalizeRemoteDeviceId,
  parseRemoteDeviceId,
} from '../lib/util'
import some from 'licia/some'
import CodePairModal from './CodePairModal'
import { useLayoutEffect, useRef, useState } from 'react'
import DeviceEditModal from './DeviceEditModal'
import { parseDevicesCsv, stringifyDevicesCsv } from '../lib/csv'
import map from 'licia/map'
import { IDeviceCsvRow } from 'common/types'
import { isDeviceOnline } from 'common/device'
import { mapWithConcurrency } from '../lib/concurrency'

export default observer(function Toolbar() {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const connectButtonContentRef = useRef<HTMLSpanElement>(null)
  const pairButtonContentRef = useRef<HTMLSpanElement>(null)
  const importingRef = useRef(false)
  const [codePairModalVisible, setCodePairModalVisible] = useState(false)
  const [deviceEditModalVisible, setDeviceEditModalVisible] = useState(false)
  const [devicesImporting, setDevicesImporting] = useState(false)
  const { device, remoteDevices } = store
  const connectionsBusy =
    store.devicesRefreshing || store.deviceConnecting || devicesImporting
  const connectDisabled = connectionsBusy || isStrBlank(store.ip)
  const refreshTitle = store.devicesRefreshing
    ? store.deviceRefreshProgress.total > 0
      ? t('devicesRefreshProgress', store.deviceRefreshProgress)
      : t('refreshingDevices')
    : t('refreshAllDevices')

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

  useLayoutEffect(() => {
    const button = connectButtonContentRef.current?.closest('button')
    if (!button) {
      return
    }
    const title = t(store.deviceConnecting ? 'connectingDevice' : 'connect')
    button.disabled = connectDisabled
    button.title = title
    button.setAttribute('aria-label', title)
    button.setAttribute(
      'aria-busy',
      store.deviceConnecting ? 'true' : 'false'
    )

    const toolbar = connectButtonContentRef.current?.closest('.luna-toolbar')
    const ipInput = toolbar?.querySelector<HTMLInputElement>(
      `.${Style.ip} input`
    )
    const portInput = toolbar?.querySelector<HTMLInputElement>(
      `.${Style.port} input`
    )
    if (ipInput) {
      ipInput.disabled = connectionsBusy
    }
    if (portInput) {
      portInput.disabled = connectionsBusy
    }

    const pairButton = pairButtonContentRef.current?.closest('button')
    if (pairButton) {
      pairButton.disabled = connectionsBusy
      pairButton.setAttribute('aria-label', t('pair'))
    }
  }, [connectDisabled, connectionsBusy, store.deviceConnecting])

  return (
    <>
      <LunaToolbar className={Style.container}>
        <LunaToolbarInput
          keyName="ip"
          className={Style.ip}
          placeholder={t('ipAddress')}
          value={store.ip}
          disabled={connectionsBusy}
          onChange={(val) => store.setIp(val)}
        />
        <LunaToolbarInput
          keyName="port"
          className={Style.port}
          placeholder={t('port')}
          value={store.port}
          disabled={connectionsBusy}
          onChange={(val) => store.setPort(val)}
        />
        <LunaToolbarButton
          onClick={async () => {
            if (connectDisabled) {
              return
            }
            try {
              const port = isStrBlank(store.port)
                ? undefined
                : toNum(store.port)
              await store.connectDevice(store.ip, port)
            } catch {
              notify(t('connectErr'), { icon: 'error' })
            }
          }}
          state="hover"
          disabled={connectDisabled}
        >
          <span
            ref={connectButtonContentRef}
            className={Style.connectButtonContent}
          >
            {store.deviceConnecting ? (
              <span className={Style.connectionSpinner} aria-hidden="true" />
            ) : null}
            <span>{t('connect')}</span>
          </span>
        </LunaToolbarButton>
        <LunaToolbarSeparator />
        <LunaToolbarButton
          onClick={() => {
            if (!connectionsBusy) {
              setCodePairModalVisible(true)
            }
          }}
          state="hover"
          disabled={connectionsBusy}
        >
          <span ref={pairButtonContentRef}>{t('pair')}</span>
        </LunaToolbarButton>
        <LunaToolbarSpace />
        <ToolbarIcon
          icon="wifi"
          title={t('wirelessMode')}
          disabled={connectionsBusy || wirelessDisabled}
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
            connectionsBusy ||
            !device ||
            !isRemoteDevice(device.id) ||
            device.type === 'offline'
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
            connectionsBusy ||
            !device ||
            !isRemoteDevice(device.id) ||
            device.type !== 'offline'
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
          disabled={connectionsBusy}
          onClick={async () => {
            if (connectionsBusy || importingRef.current) {
              return
            }
            importingRef.current = true
            setDevicesImporting(true)
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
            } finally {
              importingRef.current = false
              setDevicesImporting(false)
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
          disabled={
            store.screenshotsRefreshing ||
            connectionsBusy ||
            !hasOnlineDevices
          }
          onClick={async () => {
            if (store.screenshotsRefreshing || connectionsBusy) {
              return
            }
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
          className={store.devicesRefreshing ? Style.refreshing : undefined}
          title={refreshTitle}
          disabled={connectionsBusy || store.screenshotsRefreshing}
          onClick={async () => {
            if (connectionsBusy || store.screenshotsRefreshing) {
              return
            }
            try {
              const result = await store.refreshDevices()
              notify(
                result.total > 0
                  ? t('devicesRefreshResult', result)
                  : t('deviceRefreshed'),
                { icon: result.offline > 0 ? 'warning' : 'success' }
              )
            } catch {
              notify(t('devicesRefreshFailed'), { icon: 'error' })
            }
          }}
        />
      </LunaToolbar>
      {store.devicesRefreshing ? (
        <span className={Style.srOnly} role="status" aria-live="polite">
          {refreshTitle}
        </span>
      ) : null}
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

  if (endpoints.size === 0) {
    return { total: 0, connected: 0, failed: 0 }
  }

  await mapWithConcurrency(
    Array.from(endpoints.values()),
    3,
    async ({ ip, port }) => {
      try {
        await main.connectDevice(ip, port)
        return
      } catch {
        return
      }
    }
  )
  const devices = await store.verifyDeviceConnections(
    Array.from(endpoints.keys())
  )
  const onlineDeviceIds = new Set(
    devices
      .map((device) => normalizeRemoteDeviceId(device.id))
      .filter((id): id is string => Boolean(id))
  )
  const connected = Array.from(endpoints.keys()).filter((deviceId) =>
    onlineDeviceIds.has(deviceId)
  ).length
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
    case 'DEVICE_VERIFICATION_FAILED':
      return t('devicesRefreshFailed')
    default:
      return t('csvImportErr')
  }
}
