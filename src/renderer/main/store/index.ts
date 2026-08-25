import { action, makeObservable, observable, runInAction } from 'mobx'
import isStr from 'licia/isStr'
import find from 'licia/find'
import BaseStore from 'share/renderer/store/BaseStore'
import { Settings } from './settings'
import { Application } from './application'
import { Process } from './process'
import { Webview } from './webview'
import { File } from './file'
import { Layout } from './layout'
import { installPackages, setMainStore } from '../../lib/util'
import { setMemStore } from 'share/renderer/lib/util'
import isEmpty from 'licia/isEmpty'
import { IDevice } from 'common/types'
import { isMainPanel, type MainPanel } from 'common/mainPanel'
import type { IAyaDeepLinkDispatch } from 'common/deepLink'
import { notify } from 'share/renderer/lib/util'
import { t } from 'common/util'

export const DEVICE_LIST_DEFAULT_WIDTH = 224
export const DEVICE_LIST_MIN_WIDTH = 200
export const DEVICE_LIST_MAX_WIDTH = 420
export const DEVICE_LIST_MAIN_MIN_WIDTH = 700
export const DEVICE_LIST_RESIZER_WIDTH = 8

export function getDeviceListMaxWidth(viewportWidth: number) {
  return Math.max(
    DEVICE_LIST_MIN_WIDTH,
    Math.min(
      DEVICE_LIST_MAX_WIDTH,
      viewportWidth -
        DEVICE_LIST_MAIN_MIN_WIDTH -
        DEVICE_LIST_RESIZER_WIDTH
    )
  )
}

export function clampDeviceListWidth(
  width: number,
  maxWidth = DEVICE_LIST_MAX_WIDTH
) {
  if (!Number.isFinite(width)) {
    return DEVICE_LIST_DEFAULT_WIDTH
  }

  return Math.round(
    Math.max(DEVICE_LIST_MIN_WIDTH, Math.min(maxWidth, width))
  )
}

class Store extends BaseStore {
  devices: IDevice[] = []
  device: IDevice | null = null
  panel: MainPanel = 'overview'
  deviceListWidth = DEVICE_LIST_DEFAULT_WIDTH
  settings = new Settings()
  application = new Application()
  process = new Process()
  webview = new Webview()
  file = new File()
  layout = new Layout()
  ready = false
  private refreshRequest = 0
  private deviceListWidthDirty = false
  constructor() {
    super()

    makeObservable(this, {
      devices: observable,
      device: observable,
      panel: observable,
      deviceListWidth: observable,
      settings: observable,
      ready: observable,
      selectDevice: action,
      selectPanel: action,
      setDeviceListWidth: action,
    })

    this.bindEvent()
    this.init()
  }
  selectDevice = (device: string | IDevice | null) => {
    const currentDeviceId = this.device?.id || null
    if (isStr(device)) {
      const d = find(this.devices, ({ id }) => id === device)
      this.device = d || null
    } else {
      this.device = device
    }

    if (currentDeviceId === (this.device?.id || null)) {
      return
    }
    setMainStore('device', this.device)
  }
  selectPanel(panel: MainPanel) {
    this.panel = panel
    setMainStore('panel', panel)
  }
  setDeviceListWidth = (width: number) => {
    this.deviceListWidthDirty = true
    this.deviceListWidth = clampDeviceListWidth(width)
  }
  saveDeviceListWidth = () => {
    setMainStore('deviceListWidth', this.deviceListWidth)
  }
  private async init() {
    const [panel, device, deviceListWidth] = await Promise.all([
      main.getMainStore('panel'),
      main.getMainStore('device'),
      main.getMainStore('deviceListWidth'),
    ])
    runInAction(() => {
      if (isMainPanel(panel)) {
        this.panel = panel
      }
      if (device) {
        this.device = device
      }
      if (
        !this.deviceListWidthDirty &&
        typeof deviceListWidth === 'number'
      ) {
        this.deviceListWidth = clampDeviceListWidth(deviceListWidth)
      }
    })
    await this.refreshDevices()

    runInAction(() => {
      this.ready = true
    })
    await main.deepLinkReady()

    const openFile = await main.getOpenFile('.apk')
    if (openFile && this.device) {
      installPackages(this.device.id, [openFile])
    }
  }
  refreshDevices = async () => {
    const request = ++this.refreshRequest
    const devices = await main.getDevices()
    if (request !== this.refreshRequest) {
      return
    }
    this.applyDevices(devices)
  }
  private applyDevices(devices: IDevice[]) {
    runInAction(() => {
      this.devices = devices
      setMemStore('devices', devices)
    })
    if (!isEmpty(devices)) {
      if (!this.device) {
        this.selectDevice(devices[0])
      } else {
        const device = find(devices, ({ id }) => id === this.device!.id)
        if (!device) {
          this.selectDevice(devices[0])
        } else {
          runInAction(() => {
            this.device = device
          })
        }
      }
    } else {
      if (this.device) {
        this.selectDevice(null)
      }
    }
  }
  private bindEvent() {
    main.on('changeDevice', this.refreshDevices)
    main.on('refreshDevices', this.refreshDevices)
    main.on('syncDevices', (devices: IDevice[]) => {
      // 设备管理器提供的快照比正在进行的旧查询更新，先使旧请求失效再应用。
      this.refreshRequest += 1
      this.applyDevices(devices)
    })
    main.on('selectDevice', this.selectDevice)
    main.on('ayaDeepLinkCommand', (dispatch: IAyaDeepLinkDispatch) => {
      this.applyDeepLinkCommand(dispatch)
    })
    main.on('ayaDeepLinkError', (error: string) => {
      const key =
        error === 'device-unavailable'
          ? 'urlSchemeDeviceUnavailable'
          : error === 'action-failed'
            ? 'urlSchemeActionFailed'
            : error === 'unsupported-action'
              ? 'urlSchemeUnsupported'
              : 'urlSchemeInvalid'
      notify(t(key), { icon: 'error' })
    })
    main.on('installPackage', async (path: string) => {
      if (this.device) {
        await installPackages(this.device.id, [path])
      }
    })
  }

  private applyDeepLinkCommand(dispatch: IAyaDeepLinkDispatch) {
    const { command, devices } = dispatch
    if (command.type === 'devices' || command.type === 'add') {
      return
    }
    if (devices) {
      this.refreshRequest += 1
      runInAction(() => {
        this.devices = devices
      })
    }
    const device = command.deviceId
      ? find(this.devices, ({ id }) => id === command.deviceId)
      : this.device
    if (command.deviceId && !device) {
      notify(t('urlSchemeDeviceUnavailable'), { icon: 'error' })
      return
    }
    runInAction(() => {
      if (device) {
        this.device = device
      }
      if (command.type === 'panel') {
        this.panel = command.panel
      }
    })
  }
}

export default new Store()
