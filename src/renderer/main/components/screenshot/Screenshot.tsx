import { observer } from 'mobx-react-lite'
import Style from './Screenshot.module.scss'
import LunaToolbar, {
  LunaToolbarButton,
  LunaToolbarSeparator,
  LunaToolbarSpace,
  LunaToolbarText,
} from 'luna-toolbar/react'
import dataUrl from 'licia/dataUrl'
import toBool from 'licia/toBool'
import fileSize from 'licia/fileSize'
import base64 from 'licia/base64'
import convertBin from 'licia/convertBin'
import download from 'licia/download'
import loadImg from 'licia/loadImg'
import className from 'licia/className'
import LunaImageViewer from 'luna-image-viewer/react'
import ImageViewer from 'luna-image-viewer'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import { useEffect, useRef, useState } from 'react'
import store from '../../store'
import { t } from 'common/util'
import CopyButton from 'share/renderer/components/CopyButton'
import { copyData, notify } from 'share/renderer/lib/util'
import dateFormat from 'licia/dateFormat'
import {
  IDeviceScreenshotCache,
  IDeviceScreenshotCacheUpdate,
} from 'common/types'
import { getDeviceScreenshotCacheKey } from 'common/device'

interface IScreenshotImage {
  data: string
  url: string
  width: number
  height: number
  size: number
}

export default observer(function Screenshot() {
  const [image, setImage] = useState<IScreenshotImage | null>(null)
  const [capturing, setCapturing] = useState(false)
  const imageViewerRef = useRef<ImageViewer>(null)
  const requestRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    void loadCachedScreenshot()
    const removeListener = main.on(
      'deviceScreenshotUpdated',
      (update: IDeviceScreenshotCacheUpdate) => {
        if (
          store.device &&
          update.cacheKey === getDeviceScreenshotCacheKey(store.device.id)
        ) {
          void loadCachedScreenshot()
        }
      }
    )
    return () => {
      mountedRef.current = false
      requestRef.current += 1
      removeListener()
    }
  }, [])

  function save() {
    const blob = convertBin(image!.data, 'Blob')
    download(blob, `screenshot-${dateFormat('yyyymmddHHMM')}.png`, 'image/png')
  }

  function copy() {
    copyData(image!.data, 'image/png')
  }

  async function recapture() {
    if (!store.device || capturing) {
      return
    }
    const request = ++requestRef.current
    setCapturing(true)
    try {
      const cachedScreenshot = await main.captureDeviceScreenshot(
        store.device.id
      )
      applyCachedScreenshot(cachedScreenshot, request)
    } catch {
      notify(t('screenshotFailed'), { icon: 'error' })
      if (mountedRef.current) {
        await loadCachedScreenshot()
      }
    } finally {
      if (mountedRef.current) {
        setCapturing(false)
      }
    }
  }

  async function loadCachedScreenshot() {
    if (!store.device) {
      return
    }
    const request = ++requestRef.current
    try {
      const cachedScreenshot = await main.getCachedDeviceScreenshot(
        store.device.id
      )
      if (!cachedScreenshot) {
        if (mountedRef.current && requestRef.current === request) {
          setImage(null)
        }
        return
      }
      applyCachedScreenshot(cachedScreenshot, request)
    } catch {
      // 缓存读取失败时保持当前画面，手动重新截图仍可恢复缓存。
    }
  }

  function applyCachedScreenshot(
    cachedScreenshot: IDeviceScreenshotCache,
    request: number
  ) {
    const url = dataUrl.stringify(cachedScreenshot.data, 'image/png')
    loadImg(url, (error, loadedImage) => {
      if (
        error ||
        !mountedRef.current ||
        requestRef.current !== request
      ) {
        return
      }
      setImage({
        data: cachedScreenshot.data,
        url,
        width: loadedImage.width,
        height: loadedImage.height,
        size: base64.decode(cachedScreenshot.data).length,
      })
    })
  }

  const hasImage = toBool(image)

  return (
    <div className={className('panel-with-toolbar', Style.container)}>
      <LunaToolbar className="panel-toolbar">
        <ToolbarIcon
          icon="refresh"
          title={t(capturing ? 'updatingScreenshots' : 'recapture')}
          onClick={recapture}
          disabled={!store.device || capturing}
        />
        <ToolbarIcon
          icon="save"
          title={t('save')}
          onClick={save}
          disabled={!hasImage}
        />
        <LunaToolbarButton onClick={() => {}} disabled={!hasImage}>
          <CopyButton className="toolbar-icon" onClick={copy} />
        </LunaToolbarButton>
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="rotate-left"
          title={t('rotateLeft')}
          onClick={() => imageViewerRef.current?.rotate(-90)}
          disabled={!hasImage}
        />
        <ToolbarIcon
          icon="rotate-right"
          title={t('rotateRight')}
          onClick={() => imageViewerRef.current?.rotate(90)}
          disabled={!hasImage}
        />
        <ToolbarIcon
          icon="zoom-in"
          title={t('zoomIn')}
          onClick={() => imageViewerRef.current?.zoom(0.1)}
          disabled={!hasImage}
        />
        <ToolbarIcon
          icon="zoom-out"
          title={t('zoomOut')}
          onClick={() => imageViewerRef.current?.zoom(-0.1)}
          disabled={!hasImage}
        />
        <ToolbarIcon
          icon="original"
          title={t('actualSize')}
          onClick={() => imageViewerRef.current?.zoomTo(1)}
          disabled={!hasImage}
        />
        <ToolbarIcon
          icon="reset"
          title={t('reset')}
          onClick={() => imageViewerRef.current?.reset()}
          disabled={!hasImage}
        />
        <LunaToolbarSpace />
        <LunaToolbarText
          text={
            hasImage
              ? `${image!.width}x${image!.height} PNG ${fileSize(image!.size)}B`
              : ''
          }
        />
      </LunaToolbar>
      {image ? (
        <LunaImageViewer
          className="panel-body"
          image={image.url}
          onCreate={(imageViewer) => (imageViewerRef.current = imageViewer)}
        />
      ) : (
        <div className="panel-body" />
      )}
    </div>
  )
})
