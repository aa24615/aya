import { t } from 'common/util'
import type { IDeviceConnectionState } from '../store'

const phaseTranslationKeys = {
  waiting: 'deviceConnectionWaiting',
  connecting: 'deviceConnectionConnecting',
  verifying: 'deviceConnectionVerifying',
  failed: 'deviceConnectionFailed',
  verificationFailed: 'deviceConnectionVerificationFailed',
} as const

const shortPhaseTranslationKeys = {
  waiting: 'deviceConnectionWaitingShort',
  connecting: 'deviceConnectionConnectingShort',
  verifying: 'deviceConnectionVerifyingShort',
  failed: 'deviceConnectionFailedShort',
  verificationFailed: 'deviceConnectionVerificationFailedShort',
} as const

export function getDeviceConnectionPresentation(
  connection: IDeviceConnectionState
) {
  const label = t(phaseTranslationKeys[connection.phase])
  return {
    label,
    compactLabel: t(shortPhaseTranslationKeys[connection.phase]),
    title:
      connection.total > 1
        ? t('deviceConnectionProgress', {
            status: label,
            position: connection.position,
            total: connection.total,
          })
        : label,
    pending:
      connection.phase === 'waiting' ||
      connection.phase === 'connecting' ||
      connection.phase === 'verifying',
  }
}
