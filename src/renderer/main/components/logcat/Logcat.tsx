import { observer } from 'mobx-react-lite'
import LunaToolbar, {
  LunaToolbarInput,
  LunaToolbarSelect,
  LunaToolbarSeparator,
  LunaToolbarSpace,
} from 'luna-toolbar/react'
import LunaLogcat from 'luna-logcat/react'
import Logcat from 'luna-logcat'
import map from 'licia/map'
import rpad from 'licia/rpad'
import dateFormat from 'licia/dateFormat'
import toNum from 'licia/toNum'
import trim from 'licia/trim'
import { useEffect, useRef, useState } from 'react'
import store from '../../store'
import copy from 'licia/copy'
import download from 'licia/download'
import toStr from 'licia/toStr'
import { t } from 'common/util'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import contextMenu from 'share/renderer/lib/contextMenu'

export default observer(function Logcat() {
  const [view, setView] = useState<'compact' | 'standard'>('standard')
  const [softWrap, setSoftWrap] = useState(false)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<{
    priority?: number
    package?: string
    tag?: string
  }>({})
  const logcatRef = useRef<Logcat>(null)
  const entriesRef = useRef<any[]>([])
  const logcatIdRef = useRef('')
  const disposedRef = useRef(false)
  const logcatRequestRef = useRef(0)

  const { device } = store

  useEffect(() => {
    disposedRef.current = false
    function onLogcatEntry(id, entry) {
      if (logcatIdRef.current !== id) {
        return
      }
      if (logcatRef.current) {
        logcatRef.current.append(entry)
        entriesRef.current.push(entry)
      }
    }
    const offLogcatEntry = main.on('logcatEntry', onLogcatEntry)
    openLogcatSession()

    return () => {
      disposedRef.current = true
      logcatRequestRef.current += 1
      offLogcatEntry()
      if (logcatIdRef.current) {
        main.closeLogcat(logcatIdRef.current)
      }
    }
  }, [])

  function openLogcatSession() {
    if (!device) {
      return
    }
    const request = ++logcatRequestRef.current
    main.openLogcat(device.id).then((id) => {
      if (disposedRef.current || request !== logcatRequestRef.current) {
        main.closeLogcat(id)
        return
      }
      logcatIdRef.current = id
    })
  }

  if (store.panel !== 'logcat') {
    if (!paused && logcatIdRef.current) {
      main.pauseLogcat(logcatIdRef.current)
    }
  } else {
    if (!paused && logcatIdRef.current) {
      main.resumeLogcat(logcatIdRef.current)
    }
  }

  function save() {
    const data = map(entriesRef.current, (entry) => {
      return trim(
        `${dateFormat(entry.date, 'mm-dd HH:MM:ss.l')} ${rpad(
          entry.pid,
          5,
          ' '
        )} ${rpad(entry.tid, 5, ' ')} ${toLetter(entry.priority)} ${
          entry.tag
        }: ${entry.message}`
      )
    }).join('\n')
    const name = `${store.device ? store.device.name : 'logcat'}.${dateFormat(
      'yyyymmddHH'
    )}.txt`

    download(data, name, 'text/plain')
  }

  function clear() {
    if (logcatRef.current) {
      logcatRef.current.clear()
    }
    entriesRef.current = []
  }

  const onContextMenu = (e: PointerEvent, entry: any) => {
    e.preventDefault()
    const logcat = logcatRef.current!
    const template: any[] = [
      {
        label: t('copy'),
        click: () => {
          if (logcat.hasSelection()) {
            copy(logcat.getSelection())
          } else if (entry) {
            copy(entry.message)
          }
        },
      },
      {
        type: 'separator',
      },
      {
        label: t('clear'),
        click: clear,
      },
    ]

    contextMenu(e, template)
  }

  return (
    <div className="panel-with-toolbar">
      <LunaToolbar
        className="panel-toolbar"
        onChange={(key, val) => {
          switch (key) {
            case 'view':
              setView(val)
              break
            case 'priority':
              setFilter({
                ...filter,
                priority: toNum(val),
              })
              break
            case 'package':
              setFilter({
                ...filter,
                package: val,
              })
              break
            case 'tag':
              setFilter({
                ...filter,
                tag: val,
              })
              break
          }
        }}
      >
        <LunaToolbarSelect
          keyName="view"
          disabled={!device}
          value={view}
          options={{
            [t('standardView')]: 'standard',
            [t('compactView')]: 'compact',
          }}
        />
        <LunaToolbarSeparator />
        <LunaToolbarSelect
          keyName="priority"
          disabled={!device}
          value={toStr(filter.priority || 2)}
          options={{
            VERBOSE: '2',
            DEBUG: '3',
            INFO: '4',
            WARNING: '5',
            ERROR: '6',
          }}
        />
        <LunaToolbarInput
          keyName="package"
          placeholder={t('package')}
          value={filter.package || ''}
        />
        <LunaToolbarInput
          keyName="tag"
          placeholder={t('tag')}
          value={filter.tag || ''}
        />
        <LunaToolbarSpace />
        <ToolbarIcon
          icon="save"
          title={t('save')}
          onClick={save}
          disabled={!device}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="soft-wrap"
          state={softWrap ? 'hover' : ''}
          title={t('softWrap')}
          onClick={() => setSoftWrap(!softWrap)}
        />
        <ToolbarIcon
          icon="scroll-end"
          title={t('scrollToEnd')}
          onClick={() => logcatRef.current?.scrollToEnd()}
          disabled={!device}
        />
        <ToolbarIcon
          icon="reset"
          title={t('restart')}
          onClick={() => {
            if (logcatIdRef.current) {
              main.closeLogcat(logcatIdRef.current)
              logcatIdRef.current = ''
              clear()
            }
            logcatRequestRef.current += 1
            openLogcatSession()
          }}
          disabled={!device}
        />
        <ToolbarIcon
          icon={paused ? 'play' : 'pause'}
          title={t(paused ? 'resume' : 'pause')}
          onClick={() => {
            const logcatId = logcatIdRef.current
            if (!logcatId) {
              return
            }
            if (paused) {
              main.resumeLogcat(logcatId)
            } else {
              main.pauseLogcat(logcatId)
            }
            setPaused(!paused)
          }}
          disabled={!device}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="delete"
          title={t('clear')}
          onClick={clear}
          disabled={!device}
        />
      </LunaToolbar>
      <LunaLogcat
        className="panel-body"
        maxNum={10000}
        filter={filter}
        wrapLongLines={softWrap}
        onContextMenu={onContextMenu}
        view={view}
        onCreate={(logcat) => (logcatRef.current = logcat)}
      />
    </div>
  )
})

function toLetter(priority: number) {
  return ['?', '?', 'V', 'D', 'I', 'W', 'E'][priority]
}
