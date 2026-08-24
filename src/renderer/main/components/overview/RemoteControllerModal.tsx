import LunaModal from 'luna-modal/react'
import { observer } from 'mobx-react-lite'
import { createPortal } from 'react-dom'
import { t } from 'common/util'
import { IModalProps } from 'share/common/types'
import Style from './RemoteControllerModal.module.scss'
import className from 'licia/className'
import store from '../../store'
import { AndroidKeyCode } from '@yume-chan/scrcpy'

export default observer(function RemoteControllerModal(props: IModalProps) {
  function inputKey(keyCode: AndroidKeyCode) {
    return () => {
      if (!store.device) {
        return
      }
      main.inputKey(store.device.id, keyCode)
    }
  }

  return createPortal(
    <LunaModal
      title={t('remoteController')}
      width={400}
      visible={props.visible}
      onClose={props.onClose}
    >
      <div className={Style.remoteController}>
        <div className={Style.top}>
          <div className={Style.button}>
            <span
              className="icon-power"
              title={t('powerKey')}
              aria-label={t('powerKey')}
              onClick={inputKey(AndroidKeyCode.Power)}
            />
          </div>
          <div className={Style.button}>
            <span
              className="icon-volume-down"
              title={t('volumeDown')}
              aria-label={t('volumeDown')}
              onClick={inputKey(AndroidKeyCode.VolumeDown)}
            />
          </div>
          <div className={Style.button}>
            <span
              className="icon-volume"
              title={t('volumeUp')}
              aria-label={t('volumeUp')}
              onClick={inputKey(AndroidKeyCode.VolumeUp)}
            />
          </div>
        </div>
        <div className={Style.directionPad}>
          <div
            className={Style.ok}
            title={t('ok')}
            aria-label={t('ok')}
            onClick={inputKey(AndroidKeyCode.AndroidDPadCenter)}
          >
            OK
          </div>
          <div
            className={Style.up}
            title={t('directionUp')}
            aria-label={t('directionUp')}
            onClick={inputKey(AndroidKeyCode.ArrowUp)}
          />
          <div
            className={Style.right}
            title={t('directionRight')}
            aria-label={t('directionRight')}
            onClick={inputKey(AndroidKeyCode.ArrowRight)}
          />
          <div
            className={Style.down}
            title={t('directionDown')}
            aria-label={t('directionDown')}
            onClick={inputKey(AndroidKeyCode.ArrowDown)}
          />
          <div
            className={Style.left}
            title={t('directionLeft')}
            aria-label={t('directionLeft')}
            onClick={inputKey(AndroidKeyCode.ArrowLeft)}
          />
        </div>
        <div className={Style.bottom}>
          <div className={Style.button}>
            <span
              className="icon-circle"
              title={t('home')}
              aria-label={t('home')}
              onClick={inputKey(AndroidKeyCode.AndroidHome)}
            />
          </div>
          <div className={Style.button}>
            <span
              className={className('icon-back', Style.back)}
              title={t('back')}
              aria-label={t('back')}
              onClick={inputKey(AndroidKeyCode.AndroidBack)}
            />
          </div>
          <div className={Style.button}>
            <span
              className="icon-square"
              title={t('appSwitch')}
              aria-label={t('appSwitch')}
              onClick={inputKey(AndroidKeyCode.AndroidAppSwitch)}
            />
          </div>
        </div>
      </div>
    </LunaModal>,
    document.body
  )
})
