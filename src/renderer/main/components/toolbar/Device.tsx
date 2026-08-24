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

function normalizeSearchText(text: string | undefined) {
  return (text || '').normalize('NFKC').toLowerCase()
}

export default observer(function Device() {
  const containerRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resizeStateRef = useRef<IResizeState | null>(null)
  const [resizing, setResizing] = useState(false)
  const [search, setSearch] = useState('')
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  const maxWidth = getDeviceListMaxWidth(viewportWidth)
  const renderedWidth = Math.min(store.deviceListWidth, maxWidth)
  const searchTokens = normalizeSearchText(search)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const deviceItems = map(store.devices, (device) => ({
    device,
    displayName: getDeviceDisplayName(device),
  }))
  const filteredDeviceItems = searchTokens.length
    ? deviceItems.filter(({ device, displayName }) => {
        const searchableValues = [displayName, device.id].map(
          normalizeSearchText
        )

        return searchTokens.every((token) =>
          searchableValues.some((value) => value.includes(token))
        )
      })
    : deviceItems
  const deviceCount = searchTokens.length
    ? `${filteredDeviceItems.length}/${store.devices.length}`
    : store.devices.length

  const clearSearch = () => {
    setSearch('')
    searchInputRef.current?.focus()
  }

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
            text={`${t('deviceList')} (${deviceCount})`}
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
        <div className={Style.searchBar}>
          <input
            ref={searchInputRef}
            className={Style.searchInput}
            type="search"
            value={search}
            placeholder={t('searchDevice')}
            aria-label={t('searchDevice')}
            aria-controls="main-device-list"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Escape' &&
                !event.nativeEvent.isComposing &&
                search
              ) {
                event.preventDefault()
                clearSearch()
              }
            }}
          />
          <button
            type="button"
            className={Style.searchClear}
            title={t('clear')}
            aria-label={t('clear')}
            disabled={!search}
            onClick={clearSearch}
          >
            <span className="icon-clear" aria-hidden="true" />
          </button>
          <span
            className={Style.visuallyHidden}
            role="status"
            aria-live="polite"
          >
            {store.ready
              ? t('deviceSearchResult', {
                  count: filteredDeviceItems.length,
                  total: store.devices.length,
                })
              : null}
          </span>
        </div>
        <div id="main-device-list" className={Style.list}>
          {!store.ready ? null : store.devices.length === 0 ? (
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
          ) : filteredDeviceItems.length === 0 ? (
            <div className={Style.empty}>
              <span
                className={className('icon-phone', Style.emptyIcon)}
                aria-hidden="true"
              />
              <div>{t('noMatchingDevices')}</div>
              <button
                type="button"
                className={Style.emptyAction}
                onClick={clearSearch}
              >
                {t('clear')}
              </button>
            </div>
          ) : (
            map(filteredDeviceItems, ({ device, displayName }) => {
              const online = isDeviceOnline(device)
              const title = [displayName, device.id]
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
                  <div className={Style.deviceId}>{device.id}</div>
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
