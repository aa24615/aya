import { useState } from 'react'
import { t } from '../../common/i18n'
import className from 'licia/className'

interface IProps {
  className?: string
  onClick: () => void
}

export default function CopyButton(props: IProps) {
  const [showSuccess, setShowSuccess] = useState(false)

  const onClick = () => {
    props.onClick()
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 1000)
  }

  const style: React.CSSProperties = {}
  if (showSuccess) {
    style.color = 'var(--color-success)'
  }

  return (
    <div
      className={className('icon', props.className)}
      title={t('copy')}
      aria-label={t('copy')}
      onClick={onClick}
    >
      <span
        className={`icon-${showSuccess ? 'check' : 'copy'}`}
        aria-hidden="true"
        style={style}
      ></span>
    </div>
  )
}
