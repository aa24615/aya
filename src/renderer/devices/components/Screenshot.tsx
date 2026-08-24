import { observer } from 'mobx-react-lite'
import store from '../store'
import Style from './Screenshot.module.scss'
import { JSX, useRef } from 'react'
import LunaImageViewer from 'luna-image-viewer/react'
import { t } from 'common/util'
import { LoadingBar } from 'share/renderer/components/loading'
import { isDeviceOnline } from 'common/device'

export default observer(function Screenshot() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { device } = store
  const online = device ? isDeviceOnline(device) : false
  const screenshotState = device ? store.screenshots[device.id] : undefined
  const image = store.screenshot || screenshotState?.image
  const status = screenshotState?.status

  let state: JSX.Element | null = null
  let stateType: 'default' | 'loading' | 'error' = 'default'
  let retry = false

  if (!device) {
    state = <div className={Style.message}>{t('deviceNotSelected')}</div>
  } else if (!online) {
    state = (
      <div className={Style.message}>
        {image ? t('offline') : t('screenshotUnavailable')}
      </div>
    )
  } else if (status === 'loading') {
    stateType = 'loading'
    state = (
      <>
        <LoadingBar />
        <div className={Style.message}>{t('updatingScreenshots')}</div>
      </>
    )
  } else if (status === 'error') {
    stateType = 'error'
    retry = true
    state = <div className={Style.message}>{t('screenshotFailed')}</div>
  } else if (!image) {
    retry = true
    state = <div className={Style.message}>{t('screenshotUnavailable')}</div>
  }

  return (
    <div className={Style.container} ref={containerRef}>
      {image && <LunaImageViewer image={image} />}
      {state && (
        <div
          className={`${Style.state} ${image ? Style.overlay : ''} ${
            stateType === 'error' ? Style.error : ''
          }`}
          role={stateType === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <div className={Style.stateContent}>
            {state}
            {retry && (
              <button
                type="button"
                className={Style.retry}
                onClick={() => store.refreshDeviceScreenshot(device)}
              >
                {t('recapture')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
