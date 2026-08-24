import { LunaToolbarButton } from 'luna-toolbar/react'
import className from 'licia/className'
import { PropsWithChildren, useLayoutEffect, useRef } from 'react'

interface IProps {
  icon: string
  className?: string
  title: string
  disabled?: boolean
  state?: '' | 'hover' | 'active'
  onClick: () => void
}

export default function (props: PropsWithChildren<IProps>) {
  const iconRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const icon = iconRef.current
    const button = icon?.closest('button') as HTMLButtonElement | null
    const item = icon?.closest('.luna-toolbar-item')
    if (button) {
      button.title = props.title
      button.setAttribute('aria-label', props.title)
      button.disabled = Boolean(props.disabled)
    }
    if (item) {
      item.setAttribute('title', props.title)
      item.setAttribute('aria-label', props.title)
    }
  }, [props.disabled, props.title])

  return (
    <LunaToolbarButton
      className={className(props.className, {
        'toolbar-icon-disabled': props.disabled,
      })}
      state={props.state || ''}
      onClick={() => {
        if (!props.disabled) {
          props.onClick()
        }
      }}
    >
      <div
        ref={iconRef}
        className="icon toolbar-icon"
        title={props.title}
        aria-label={props.title}
      >
        <span className={`icon-${props.icon}`} aria-hidden="true"></span>
      </div>
    </LunaToolbarButton>
  )
}
