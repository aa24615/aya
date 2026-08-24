import { IDevice } from 'common/types'
import { t } from 'common/util'
import LunaModal from 'luna-modal/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IModalProps } from 'share/common/types'
import { Input, Row, Textarea } from 'share/renderer/components/setting'
import store from '../store'

interface IProps extends IModalProps {
  device: IDevice | null
}

export default function DeviceEditModal(props: IProps) {
  const [deviceName, setDeviceName] = useState('')
  const [remark, setRemark] = useState('')

  useEffect(() => {
    if (props.visible && props.device) {
      const metadata = store.getDeviceMetadata(props.device)
      setDeviceName(metadata.deviceName)
      setRemark(metadata.remark)
    }
  }, [props.visible, props.device])

  function save() {
    if (!props.device) {
      return
    }
    store.setDeviceMetadata(props.device, deviceName, remark)
    props.onClose()
  }

  return createPortal(
    <LunaModal
      title={t('editDevice')}
      visible={props.visible}
      onClose={props.onClose}
      width={460}
    >
      <Row className="modal-setting-row">
        <Input
          title={t('deviceName')}
          value={deviceName}
          onChange={setDeviceName}
        />
      </Row>
      <Row className="modal-setting-row">
        <Textarea
          title={t('remark')}
          rows={5}
          value={remark}
          onChange={setRemark}
        />
      </Row>
      <div className="modal-button button primary" onClick={save}>
        {t('save')}
      </div>
    </LunaModal>,
    document.body
  )
}
