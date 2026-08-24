import LunaDataGrid from 'luna-data-grid/react'
import { observer } from 'mobx-react-lite'
import Style from './DeviceManager.module.scss'
import { t } from 'common/util'
import map from 'licia/map'
import concat from 'licia/concat'
import store from '../store'
import { useRef } from 'react'
import DataGrid from 'luna-data-grid'
import { useResizeSensor } from 'share/renderer/lib/hooks'
import { isDeviceOnline } from 'common/device'

export default observer(function DeviceManager() {
  const containerRef = useRef<HTMLDivElement>(null)
  const dataGridRef = useRef<DataGrid>(null)

  useResizeSensor(containerRef, () => {
    dataGridRef.current?.fit()
  })

  const devices = map(concat(store.devices, store.remoteDevices), (device) => {
    const metadata = store.getDeviceMetadata(device)
    return {
      id: device.id,
      model: device.name,
      deviceName: metadata.deviceName,
      remark: metadata.remark,
      serialno: device.serialno,
      androidVersion: device.androidVersion
        ? `Android ${device.androidVersion}${device.sdkVersion ? ` (API ${device.sdkVersion})` : ''}`
        : '',
      status: createStatusTag(isDeviceOnline(device)),
      type: device.type,
    }
  })

  return (
    <div ref={containerRef} className={Style.container}>
      <LunaDataGrid
        className={Style.devices}
        onSelect={(node) => store.selectDevice(node.data.id as string)}
        onDeselect={() => store.selectDevice(null)}
        columns={columns}
        data={devices}
        selectable={true}
        filter={store.filter}
        onDoubleClick={(e, node) => {
          if (
            node.data.type === 'device' ||
            node.data.type === 'emulator'
          ) {
            main.sendToWindow('main', 'selectDevice', node.data.id)
          }
        }}
        uniqueId="id"
        onCreate={(dataGrid) => {
          dataGridRef.current = dataGrid
          dataGrid.fit()
        }}
      />
    </div>
  )
})

const columns = [
  {
    id: 'id',
    title: 'ID',
    sortable: true,
    weight: 15,
  },
  {
    id: 'serialno',
    title: t('serialno'),
    sortable: true,
    weight: 15,
  },
  {
    id: 'model',
    title: t('model'),
    sortable: true,
    weight: 18,
  },
  {
    id: 'deviceName',
    title: t('deviceName'),
    sortable: true,
    weight: 15,
  },
  {
    id: 'remark',
    title: t('remark'),
    sortable: true,
    weight: 20,
  },
  {
    id: 'androidVersion',
    title: t('androidVersion'),
    sortable: true,
    weight: 18,
  },
  {
    id: 'status',
    title: t('status'),
    sortable: true,
    weight: 8,
  },
]

function createStatusTag(online: boolean) {
  const tag = document.createElement('span')
  tag.className = `${Style.statusTag} ${
    online ? Style.statusOnline : Style.statusOffline
  }`
  tag.textContent = online ? t('online') : t('offline')
  return tag
}
