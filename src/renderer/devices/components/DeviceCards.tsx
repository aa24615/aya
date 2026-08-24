import { getDeviceDisplayName, isDeviceOnline } from 'common/device'
import { IDevice } from 'common/types'
import { t } from 'common/util'
import concat from 'licia/concat'
import className from 'licia/className'
import { observer } from 'mobx-react-lite'
import store from '../store'
import Style from './DeviceManager.module.scss'

interface IDeviceCard {
  device: IDevice
  displayName: string
  remark: string
  searchableText: string
  online: boolean
  originalIndex: number
}

/**
 * Card view for the device manager. Device-provided strings are rendered as
 * React text nodes so imported names and remarks cannot inject markup.
 */
export default observer(function DeviceCards() {
  const filter = store.filter.trim().toLocaleLowerCase()
  const cards = concat(store.devices, store.remoteDevices)
    .map((device, originalIndex) => createDeviceCard(device, originalIndex))
    .filter((card) => !filter || card.searchableText.includes(filter))
    .sort((a, b) => {
      if (a.online !== b.online) {
        return a.online ? -1 : 1
      }
      return a.originalIndex - b.originalIndex
    })

  if (cards.length === 0) {
    return (
      <div className={Style.cardEmpty}>
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
      role="listbox"
      onClick={() => store.selectDevice(null)}
    >
      {cards.map(({ device, displayName, remark, online }) => {
        const screenshot = store.screenshots[device.id]
        const selected = store.device?.id === device.id
        const androidVersion = formatAndroidVersion(device)
        const title = [displayName, device.name, device.id, remark]
          .filter(Boolean)
          .join('\n')

        return (
          <button
            key={device.id}
            type="button"
            role="option"
            aria-selected={selected}
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
            <div className={Style.cardScreenshot}>
              {screenshot?.image ? (
                <>
                  <img
                    className={Style.cardThumbnail}
                    src={screenshot.image}
                    alt={`${displayName} ${t('screenshot')}`}
                    draggable={false}
                  />
                  <span
                    className={Style.cardScreenshotCaption}
                    title={new Date(screenshot.updatedAt).toLocaleString()}
                  >
                    {t('latestScreenshot')}
                  </span>
                </>
              ) : null}
              <ScreenshotState
                hasImage={Boolean(screenshot?.image)}
                online={online}
                status={screenshot?.status}
              />
            </div>
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
              {device.name && device.name !== displayName ? (
                <div className={Style.cardDetail} title={device.name}>
                  {device.name}
                </div>
              ) : null}
              <div className={Style.cardDeviceId} title={device.id}>
                {device.id}
              </div>
              {device.serialno ? (
                <div className={Style.cardDetail} title={device.serialno}>
                  {t('serialno')}: {device.serialno}
                </div>
              ) : null}
              {androidVersion ? (
                <div className={Style.cardDetail} title={androidVersion}>
                  {androidVersion}
                </div>
              ) : null}
              {remark ? (
                <div className={Style.cardRemark} title={remark}>
                  {remark}
                </div>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
})

function createDeviceCard(
  device: IDevice,
  originalIndex: number
): IDeviceCard {
  const metadata = store.getDeviceMetadata(device)
  const online = isDeviceOnline(device)
  const displayName = getDeviceDisplayName({
    ...device,
    deviceName: metadata.deviceName,
  })
  const androidVersion = formatAndroidVersion(device)
  const status = online ? t('online') : t('offline')
  const searchableText = [
    displayName,
    metadata.deviceName,
    device.name,
    device.id,
    device.serialno,
    metadata.remark,
    androidVersion,
    status,
    online ? 'online' : 'offline',
  ]
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase()

  return {
    device,
    displayName,
    remark: metadata.remark,
    searchableText,
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

function ScreenshotState(props: {
  hasImage: boolean
  online: boolean
  status?: 'loading' | 'success' | 'error'
}) {
  if (!props.online) {
    return props.hasImage ? null : (
      <span className={Style.cardScreenshotState}>
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
