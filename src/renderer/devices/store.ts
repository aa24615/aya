import { action, makeObservable, observable, runInAction, toJS } from 'mobx'
import BaseStore from 'share/renderer/store/BaseStore'
import { IDevice, IDeviceCsvRow, IDeviceMetadata } from 'common/types'
import each from 'licia/each'
import filter from 'licia/filter'
import concat from 'licia/concat'
import unique from 'licia/unique'
import { isRemoteDevice } from './lib/util'
import dataUrl from 'licia/dataUrl'
import isStr from 'licia/isStr'
import find from 'licia/find'

class Store extends BaseStore {
  filter = ''
  ip = ''
  port = ''
  devices: IDevice[] = []
  remoteDevices: IDevice[] = []
  deviceMetadata: Record<string, IDeviceMetadata> = {}
  screenshotWeight = 40
  device: IDevice | null = null
  screenshot: string | null = null
  constructor() {
    super()
    makeObservable(this, {
      ip: observable,
      port: observable,
      devices: observable,
      device: observable,
      remoteDevices: observable,
      deviceMetadata: observable,
      filter: observable,
      screenshotWeight: observable,
      screenshot: observable,
      setIp: action,
      setPort: action,
      setFilter: action,
      selectDevice: action,
      updateDevices: action,
      removeRemoteDevice: action,
      setDeviceMetadata: action,
      importDevices: action,
      setScreenshotWeight: action,
    })

    this.init()
    this.bindEvent()
  }
  async init() {
    const remoteDevices: IDevice[] = await main.getDevicesStore('remoteDevices')
    const screenshotWeight: number =
      await main.getDevicesStore('screenshotWeight')
    const deviceMetadata: Record<string, IDeviceMetadata> =
      await main.getDevicesStore('deviceMetadata')
    runInAction(() => {
      if (remoteDevices) {
        this.remoteDevices = remoteDevices
      }
      if (screenshotWeight) {
        this.screenshotWeight = screenshotWeight
      }
      if (deviceMetadata) {
        this.deviceMetadata = deviceMetadata
      }
    })

    const devices: IDevice[] = await main.getMemStore('devices')
    this.updateDevices(devices)
  }
  setIp(ip: string) {
    this.ip = ip
  }
  setPort(port: string) {
    this.port = port
  }
  setFilter(filter: string) {
    this.filter = filter
  }
  selectDevice(device: IDevice | string | null) {
    if (isStr(device)) {
      const devices: IDevice[] = concat(this.devices, this.remoteDevices)
      device = find(devices, (d) => d.id === device) || null
    }
    if (device && isRemoteDevice(device.id) && device.type === 'offline') {
      const [ip, port] = device.id.split(':')
      this.ip = ip
      this.port = port
    }
    this.device = device

    this.screenshot = null
    if (device && device.type !== 'offline') {
      main.screencap(device.id).then((data) => {
        const url = dataUrl.stringify(data, 'image/png')
        runInAction(() => {
          this.screenshot = url
        })
      })
    }
  }
  updateDevices(devices: IDevice[]) {
    let remoteDevices: IDevice[] = toJS(this.remoteDevices)
    each(remoteDevices, (device) => {
      device.type = 'offline'
    })
    remoteDevices = unique(remoteDevices, (a, b) => {
      if (a.serialno && b.serialno) {
        return a.serialno === b.serialno
      }
      return a.id === b.id
    })
    remoteDevices = unique(
      concat(
        remoteDevices,
        filter(devices, (device) => isRemoteDevice(device.id))
      ),
      (a, b) => a.id === b.id
    )
    const deviceMetadata = { ...toJS(this.deviceMetadata) }
    let metadataChanged = false
    each(remoteDevices, (device) => {
      if (!device.serialno) {
        return
      }
      const idKey = this.getDeviceMetadataKey({
        id: device.id,
        serialno: '',
      })
      const importedMetadata = deviceMetadata[idKey]
      if (!importedMetadata) {
        return
      }
      const serialKey = this.getDeviceMetadataKey(device)
      deviceMetadata[serialKey] = {
        ...(deviceMetadata[serialKey] || {
          deviceName: '',
          remark: '',
        }),
        ...importedMetadata,
      }
      delete deviceMetadata[idKey]
      metadataChanged = true
    })
    this.devices = filter(devices, (device) => !isRemoteDevice(device.id))

    this.remoteDevices = remoteDevices
    main.setDevicesStore('remoteDevices', remoteDevices)
    if (metadataChanged) {
      this.deviceMetadata = deviceMetadata
      main.setDevicesStore('deviceMetadata', deviceMetadata)
    }

    if (this.device) {
      const id = this.device.id
      each(concat(remoteDevices, this.devices), (device) => {
        if (device.id === id) {
          this.selectDevice(device)
        }
      })
    }
  }
  removeRemoteDevice(id: string) {
    const device = find(this.remoteDevices, (device) => device.id === id)
    this.remoteDevices = filter(this.remoteDevices, (device) => {
      return device.id !== id
    })
    main.setDevicesStore('remoteDevices', toJS(this.remoteDevices))
    if (device) {
      const key = this.getDeviceMetadataKey(device)
      const deviceMetadata = { ...toJS(this.deviceMetadata) }
      delete deviceMetadata[key]
      this.deviceMetadata = deviceMetadata
      main.setDevicesStore('deviceMetadata', deviceMetadata)
    }
  }
  getDeviceMetadata(device: Pick<IDevice, 'id' | 'serialno'>) {
    return (
      this.deviceMetadata[this.getDeviceMetadataKey(device)] || {
        deviceName: '',
        remark: '',
      }
    )
  }
  setDeviceMetadata(device: IDevice, deviceName: string, remark: string) {
    const key = this.getDeviceMetadataKey(device)
    this.deviceMetadata = {
      ...toJS(this.deviceMetadata),
      [key]: {
        deviceName: deviceName.trim(),
        remark: remark.trim(),
      },
    }
    main.setDevicesStore('deviceMetadata', toJS(this.deviceMetadata))
  }
  importDevices(rows: IDeviceCsvRow[]) {
    const remoteDevices = toJS(this.remoteDevices)
    const deviceMetadata = { ...toJS(this.deviceMetadata) }
    const devices = concat(toJS(this.devices), remoteDevices)

    each(rows, (row) => {
      let device = find(devices, (device) => device.id === row.id)
      if (isRemoteDevice(row.id)) {
        if (!device) {
          device = {
            id: row.id,
            name: row.model || '',
            serialno: row.serialno || '',
            androidVersion: row.androidVersion || '',
            sdkVersion: row.sdkVersion || '',
            type: 'offline',
          }
          remoteDevices.push(device)
          devices.push(device)
        } else if (find(remoteDevices, (remote) => remote.id === row.id)) {
          if (row.model !== undefined) {
            device.name = row.model
          }
          if (row.serialno !== undefined) {
            device.serialno = row.serialno
          }
          if (row.androidVersion !== undefined) {
            device.androidVersion = row.androidVersion
          }
          if (row.sdkVersion !== undefined) {
            device.sdkVersion = row.sdkVersion
          }
        }
      }

      if (!device && row.serialno) {
        device = find(devices, (device) => device.serialno === row.serialno)
      }
      const metadataDevice = {
        id: row.id,
        serialno: row.serialno || device?.serialno || '',
      }
      const key = this.getDeviceMetadataKey(metadataDevice)
      const current = deviceMetadata[key] || {
        deviceName: '',
        remark: '',
      }
      deviceMetadata[key] = {
        deviceName:
          row.deviceName === undefined ? current.deviceName : row.deviceName,
        remark: row.remark === undefined ? current.remark : row.remark,
      }
    })

    this.remoteDevices = remoteDevices
    this.deviceMetadata = deviceMetadata
    if (this.device) {
      this.device =
        find(
          concat(this.devices, remoteDevices),
          (device) => device.id === this.device?.id
        ) || null
    }
    main.setDevicesStore('remoteDevices', remoteDevices)
    main.setDevicesStore('deviceMetadata', deviceMetadata)
  }
  getAllDevices() {
    return concat(this.devices, this.remoteDevices)
  }
  setScreenshotWeight(weight: number) {
    this.screenshotWeight = weight
    main.setDevicesStore('screenshotWeight', weight)
  }
  private bindEvent() {
    main.on('changeMemStore', (name, val) => {
      switch (name) {
        case 'devices':
          this.updateDevices(val)
          break
      }
    })
  }
  private getDeviceMetadataKey(device: Pick<IDevice, 'id' | 'serialno'>) {
    return device.serialno ? `serial:${device.serialno}` : `id:${device.id}`
  }
}

export default new Store()
