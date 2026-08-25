import { isDeviceOnline } from 'common/device'
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
import { normalizeRemoteDeviceId } from '../lib/util'
import Style from './DeviceManager.module.scss'

interface IDeviceCard {
  device: IDevice
  displayName: string
  endpoint: string
  matchesSearch: boolean
  online: boolean
  originalIndex: number
}

/**
 * Card view for the device manager. Device names and IDs are rendered as
 * React text nodes so imported values cannot inject markup.
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
      {cards.map(({ device, displayName, endpoint, online }) => {
        const screenshot = store.screenshots[device.id]
        const selected = store.device?.id === device.id
        const title = `${displayName}\n${endpoint}`
        const screenshotStatus = !online
          ? t('offline')
          : screenshot?.status === 'loading'
            ? t('updatingScreenshots')
            : screenshot?.status === 'error'
              ? t('screenshotFailed')
              : screenshot?.image
                ? t('online')
                : t('screenshotUnavailable')

        return (
          <button
            key={device.id}
            type="button"
            aria-pressed={selected}
            aria-busy={screenshot?.status === 'loading'}
            aria-label={`${displayName}, ${endpoint}, ${screenshotStatus}`}
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
            <div
              className={className(Style.cardScreenshot, {
                [Style.cardScreenshotPlaceholder]: !screenshot?.image,
              })}
            >
              <span
                className={className(Style.statusTag, Style.cardStatusTag, {
                  [Style.statusOnline]: online,
                  [Style.statusOffline]: !online,
                })}
                aria-hidden="true"
              >
                {online ? t('online') : t('offline')}
              </span>
              {screenshot?.image ? (
                <img
                  className={className(Style.cardThumbnail, {
                    [Style.cardThumbnailOffline]: !online,
                  })}
                  src={screenshot.image}
                  alt=""
                  draggable={false}
                />
              ) : null}
              <ScreenshotState
                hasImage={Boolean(screenshot?.image)}
                online={online}
                status={screenshot?.status}
              />
            </div>
            <div className={Style.cardBody}>
              <span className={Style.cardDeviceName} title={displayName}>
                {displayName}
              </span>
              <span className={Style.cardEndpoint} title={endpoint}>
                {endpoint}
              </span>
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
  const displayName =
    metadata.deviceName?.trim() || device.name?.trim() || '—'

  return {
    device,
    displayName,
    endpoint: normalizeRemoteDeviceId(device.id) || device.id,
    matchesSearch: matchesDeviceSearch(device, metadata, searchTokens),
    online,
    originalIndex,
  }
}

function ScreenshotState(props: {
  hasImage: boolean
  online: boolean
  status?: 'loading' | 'success' | 'error'
}) {
  if (!props.online) {
    if (props.hasImage) {
      return null
    }
    return (
      <span
        className={Style.cardScreenshotState}
        title={t('offline')}
        aria-hidden="true"
      >
        <span className="icon-phone" aria-hidden="true" />
      </span>
    )
  }

  if (props.status === 'loading') {
    return (
      <span
        className={className(
          Style.cardScreenshotState,
          Style.cardScreenshotBadge
        )}
        title={t('updatingScreenshots')}
        aria-hidden="true"
      >
        <span className={Style.cardSpinner} aria-hidden="true" />
      </span>
    )
  }

  if (props.status === 'error') {
    return (
      <span
        className={className(
          Style.cardScreenshotState,
          Style.cardScreenshotError,
          Style.cardScreenshotBadge
        )}
        title={t('screenshotFailed')}
        aria-hidden="true"
      >
        <span aria-hidden="true">!</span>
      </span>
    )
  }

  if (!props.hasImage) {
    return (
      <span
        className={Style.cardScreenshotState}
        title={t('screenshotUnavailable')}
        aria-hidden="true"
      >
        <span className="icon-camera" aria-hidden="true" />
      </span>
    )
  }

  return null
}
