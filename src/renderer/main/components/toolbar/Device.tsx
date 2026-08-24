import LunaToolbar, {
  LunaToolbarSpace,
  LunaToolbarText,
} from 'luna-toolbar/react'
import Style from './Device.module.scss'
import { observer } from 'mobx-react-lite'
import store from '../../store'
import { t } from 'common/util'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import className from 'licia/className'
import map from 'licia/map'
import {
  getDeviceDisplayName,
  isDeviceOnline,
} from 'common/device'

export default observer(function Device() {
  return (
    <aside className={Style.container} aria-label={t('deviceList')}>
      <LunaToolbar className={Style.toolbar}>
        <LunaToolbarText
          text={`${t('deviceList')} (${store.devices.length})`}
        />
        <LunaToolbarSpace />
        <ToolbarIcon
          icon="refresh"
          title={t('refresh')}
          onClick={() => store.refreshDevices()}
        />
        <ToolbarIcon
          icon="manage"
          title={t('deviceManager')}
          onClick={() => main.showDevices()}
        />
        <ToolbarIcon
          icon="screencast"
          disabled={!store.device}
          title={t('screencast')}
          onClick={() => main.showScreencast()}
        />
      </LunaToolbar>
      <div className={Style.list} role="listbox">
        {store.ready && store.devices.length === 0 ? (
          <div className={Style.empty}>
            <span
              className={className('icon-phone', Style.emptyIcon)}
              aria-hidden="true"
            />
            <div>{t('deviceNotConnected')}</div>
            <button
              type="button"
              className={Style.emptyAction}
              onClick={() => main.showDevices()}
            >
              {t('deviceManager')}
            </button>
          </div>
        ) : (
          map(store.devices, (device) => {
            const displayName = getDeviceDisplayName(device)
            const online = isDeviceOnline(device)
            const detail = device.deviceName?.trim() ? device.name : ''
            const title = [
              displayName,
              detail,
              device.id,
              device.remark,
            ]
              .filter(Boolean)
              .join('\n')

            return (
              <button
                key={device.id}
                type="button"
                role="option"
                aria-selected={store.device?.id === device.id}
                className={className(Style.device, {
                  [Style.selected]: store.device?.id === device.id,
                })}
                title={title}
                onClick={() => {
                  if (store.device?.id !== device.id) {
                    store.selectDevice(device)
                  }
                }}
              >
                <div className={Style.deviceHeader}>
                  <span
                    className={className('icon-phone', Style.deviceIcon)}
                    aria-hidden="true"
                  />
                  <span className={Style.deviceName}>{displayName}</span>
                  <span
                    className={className(Style.statusTag, {
                      [Style.statusOnline]: online,
                      [Style.statusOffline]: !online,
                    })}
                  >
                    {online ? t('online') : t('offline')}
                  </span>
                </div>
                {detail && <div className={Style.model}>{detail}</div>}
                <div className={Style.deviceId}>{device.id}</div>
                {device.remark && (
                  <div className={Style.remark}>{device.remark}</div>
                )}
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
})
