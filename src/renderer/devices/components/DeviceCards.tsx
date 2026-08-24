import { getDeviceDisplayName, isDeviceOnline } from 'common/device'
import { IDevice } from 'common/types'
import { t } from 'common/util'
import concat from 'licia/concat'
import className from 'licia/className'
import { observer } from 'mobx-react-lite'
import store from '../store'
import {
  getDeviceSearchTokens,
  matchesDeviceSearch,
} from '../lib/search'
import Style from './DeviceManager.module.scss'

interface IDeviceCard {
  device: IDevice
  displayName: string
  remark: string
  matchesSearch: boolean
  online: boolean
  originalIndex: number
}

/**
 * Card view for the device manager. Device-provided strings are rendered as
 * React text nodes so imported names and remarks cannot inject markup.
 */
export default observer(function DeviceCards() {
  const searchTokens = getDeviceSearchTokens(store.filter)
  const cards = concat(store.devices, store.remoteDevices)
    .map((device, originalIndex) =>
      createDeviceCard(device, originalIndex, searchTokens)
    )
    .filter((card) => card.matchesSearch)
    .sort((a, b) => {
      if (a.online !== b.online) {
        return a.online ? -1 : 1
      }
      return a.originalIndex - b.originalIndex
    })

  if (cards.length === 0) {
    return (
      <div className={Style.cardEmpty} role="status">
        <span
          className={className('icon-phone', Style.cardEmptyIcon)}
          aria-hidden="true"
        />
        <span>
          {store.getAllDevices().length === 0
            ? t('deviceNotConnected')
            : t('noMatchingDevices')}
        </span>
      </div>
    )
  }

  return (
    <div
      className={Style.cardList}
      onClick={() => store.selectDevice(null)}
    >
      {cards.map(({ device, displayName, remark, online }) => {
        const screenshot = store.screenshots[device.id]
        const selected = store.device?.id === device.id
        const androidVersion = formatAndroidVersion(device)
        const model = device.name?.trim() || '—'
        const serialno = device.serialno?.trim() || '—'
        const remarkText = remark || '—'
        const androidVersionText = androidVersion || '—'
        const title = [
          `${t('deviceName')}: ${displayName}`,
          `${t('model')}: ${model}`,
          `ID: ${device.id}`,
          `${t('serialno')}: ${serialno}`,
          `${t('androidVersion')}: ${androidVersionText}`,
          `${t('remark')}: ${remarkText}`,
        ].join('\n')

        return (
          <button
            key={device.id}
            type="button"
            aria-pressed={selected}
            aria-busy={screenshot?.status === 'loading'}
            className={className(Style.deviceCard, {
              [Style.deviceCardSelected]: selected,
            })}
            title={title}
            onClick={(event) => {
              event.stopPropagation()
              if (!selected) {
                store.selectDevice(device)
              }
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              if (online) {
                main.sendToWindow('main', 'selectDevice', device.id)
              }
            }}
          >
            <div className={Style.cardBody}>
              <div className={Style.cardHeader}>
                <span className={Style.cardDeviceName}>{displayName}</span>
                <span
                  className={className(Style.statusTag, {
                    [Style.statusOnline]: online,
                    [Style.statusOffline]: !online,
                  })}
                >
                  {online ? t('online') : t('offline')}
                </span>
              </div>
              <div className={Style.cardFields}>
                <DeviceCardField label={t('model')} value={model} />
                <DeviceCardField label="ID" value={device.id} monospace />
                <DeviceCardField
                  label={t('serialno')}
                  value={serialno}
                  monospace
                />
                <DeviceCardField
                  label={t('androidVersion')}
                  value={androidVersionText}
                />
                <DeviceCardField label={t('remark')} value={remarkText} />
              </div>
            </div>
            <div className={Style.cardScreenshot}>
              {screenshot?.image ? (
                <>
                  <img
                    className={className(Style.cardThumbnail, {
                      [Style.cardThumbnailOffline]: !online,
                    })}
                    src={screenshot.image}
                    alt=""
                    draggable={false}
                  />
                  <span
                    className={Style.cardScreenshotCaption}
                    title={new Date(screenshot.updatedAt).toLocaleString()}
                  >
                    {t('cachedScreenshot')}
                  </span>
                </>
              ) : null}
              <ScreenshotState
                hasImage={Boolean(screenshot?.image)}
                online={online}
                status={screenshot?.status}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
})

function createDeviceCard(
  device: IDevice,
  originalIndex: number,
  searchTokens: readonly string[]
): IDeviceCard {
  const metadata = store.getDeviceMetadata(device)
  const online = isDeviceOnline(device)
  const displayName = getDeviceDisplayName({
    ...device,
    deviceName: metadata.deviceName,
  })

  return {
    device,
    displayName,
    remark: metadata.remark,
    matchesSearch: matchesDeviceSearch(device, metadata, searchTokens),
    online,
    originalIndex,
  }
}

function formatAndroidVersion(device: IDevice) {
  if (!device.androidVersion) {
    return ''
  }
  return `Android ${device.androidVersion}${
    device.sdkVersion ? ` (API ${device.sdkVersion})` : ''
  }`
}

function DeviceCardField(props: {
  label: string
  value: string
  monospace?: boolean
}) {
  return (
    <div className={Style.cardField}>
      <span className={Style.cardFieldLabel}>{props.label}:</span>
      <span
        className={className(Style.cardFieldValue, {
          [Style.cardFieldMonospace]: props.monospace,
        })}
        title={props.value}
      >
        {props.value}
      </span>
    </div>
  )
}

function ScreenshotState(props: {
  hasImage: boolean
  online: boolean
  status?: 'loading' | 'success' | 'error'
}) {
  if (!props.online) {
    return (
      <span
        className={className(Style.cardScreenshotState, {
          [Style.cardScreenshotOverlay]: props.hasImage,
        })}
      >
        <span className="icon-phone" aria-hidden="true" />
        {t('offline')}
      </span>
    )
  }

  if (props.status === 'loading') {
    return (
      <span
        className={className(Style.cardScreenshotState, {
          [Style.cardScreenshotOverlay]: props.hasImage,
        })}
      >
        <span className={Style.cardSpinner} aria-hidden="true" />
        {t('updatingScreenshots')}
      </span>
    )
  }

  if (props.status === 'error') {
    return (
      <span
        className={className(
          Style.cardScreenshotState,
          Style.cardScreenshotError,
          {
            [Style.cardScreenshotOverlay]: props.hasImage,
          }
        )}
      >
        <span aria-hidden="true">!</span>
        {t('screenshotFailed')}
      </span>
    )
  }

  if (!props.hasImage) {
    return (
      <span className={Style.cardScreenshotState}>
        <span className="icon-camera" aria-hidden="true" />
        {t('screenshotUnavailable')}
      </span>
    )
  }

  return null
}
