import LunaToolbar, {
  LunaToolbarSpace,
  LunaToolbarText,
} from 'luna-toolbar/react'
import Style from './Device.module.scss'
import { observer } from 'mobx-react-lite'
import store, {
  clampDeviceListWidth,
  DEVICE_LIST_DEFAULT_WIDTH,
  DEVICE_LIST_MIN_WIDTH,
  getDeviceListMaxWidth,
} from '../../store'
import { t } from 'common/util'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import className from 'licia/className'
import map from 'licia/map'
import { getDeviceDisplayName, isDeviceOnline } from 'common/device'
import {
  KeyboardEvent,
  PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'

interface IResizeState {
  pointerId: number
  startX: number
  startWidth: number
}

const RESIZING_BODY_CLASS = 'device-list-resizing'

export default observer(function Device() {
  const containerRef = useRef<HTMLElement>(null)
  const resizeStateRef = useRef<IResizeState | null>(null)
  const [resizing, setResizing] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  const maxWidth = getDeviceListMaxWidth(viewportWidth)
  const renderedWidth = Math.min(store.deviceListWidth, maxWidth)

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.body.classList.remove(RESIZING_BODY_CLASS)
    }
  }, [])

  const getCurrentWidth = () =>
    containerRef.current?.getBoundingClientRect().width || renderedWidth

  const updateWidthFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return
    }

    const width = clampDeviceListWidth(
      resizeState.startWidth + event.clientX - resizeState.startX,
      getDeviceListMaxWidth(window.innerWidth)
    )
    store.setDeviceListWidth(width)
  }

  const cleanupResize = (pointerId: number) => {
    const resizeState = resizeStateRef.current
    if (!resizeState || resizeState.pointerId !== pointerId) {
      return false
    }

    resizeStateRef.current = null
    setResizing(false)
    document.body.classList.remove(RESIZING_BODY_CLASS)
    store.saveDeviceListWidth()
    return true
  }

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    updateWidthFromPointer(event)
    if (!cleanupResize(event.pointerId)) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const cancelResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!cleanupResize(event.pointerId)) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleLostPointerCapture = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    cleanupResize(event.pointerId)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    const startWidth = getCurrentWidth()
    store.setDeviceListWidth(startWidth)
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
    }
    setResizing(true)
    document.body.classList.add(RESIZING_BODY_CLASS)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 24 : 8
    let width = getCurrentWidth()

    if (event.key === 'ArrowLeft') {
      width -= step
    } else if (event.key === 'ArrowRight') {
      width += step
    } else if (event.key === 'Home') {
      width = DEVICE_LIST_MIN_WIDTH
    } else if (event.key === 'End') {
      width = getDeviceListMaxWidth(window.innerWidth)
    } else {
      return
    }

    event.preventDefault()
    store.setDeviceListWidth(
      clampDeviceListWidth(
        width,
        getDeviceListMaxWidth(window.innerWidth)
      )
    )
    store.saveDeviceListWidth()
  }

  const resetWidth = () => {
    store.setDeviceListWidth(
      clampDeviceListWidth(
        DEVICE_LIST_DEFAULT_WIDTH,
        getDeviceListMaxWidth(window.innerWidth)
      )
    )
    store.saveDeviceListWidth()
  }

  return (
    <>
      <aside
        ref={containerRef}
        className={Style.container}
        style={{
          flexBasis: store.deviceListWidth,
          width: store.deviceListWidth,
          maxWidth,
        }}
        aria-label={t('deviceList')}
      >
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
        <div className={Style.list}>
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
              const detail = device.deviceName?.trim()
                ? device.name?.trim()
                : ''
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
                  aria-pressed={store.device?.id === device.id}
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
                      className={className(
                        'icon-phone',
                        Style.deviceIcon
                      )}
                      aria-hidden="true"
                    />
                    <span className={Style.deviceName}>
                      {displayName}
                    </span>
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
      <div
        className={className(Style.resizer, {
          [Style.resizing]: resizing,
        })}
        role="separator"
        aria-label={t('resizeDeviceList')}
        aria-orientation="vertical"
        aria-valuemin={DEVICE_LIST_MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={Math.round(renderedWidth)}
        title={t('resizeDeviceList')}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={updateWidthFromPointer}
        onPointerUp={finishResize}
        onPointerCancel={cancelResize}
        onLostPointerCapture={handleLostPointerCapture}
        onKeyDown={handleResizeKeyDown}
        onDoubleClick={resetWidth}
      />
    </>
  )
})
