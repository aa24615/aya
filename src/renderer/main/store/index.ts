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
  panel: string = 'overview'
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
  selectPanel(panel: string) {
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
      if (panel) {
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

    this.ready = true

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
    main.on('selectDevice', this.selectDevice)
    main.on('installPackage', async (path: string) => {
      if (this.device) {
        await installPackages(this.device.id, [path])
      }
    })
  }
}

export default new Store()
