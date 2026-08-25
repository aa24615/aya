import { app, BrowserWindow, session, type WebContents } from 'electron'
import { getMainStore } from '../lib/store'
import { getOpenFileFromArgv, handleEvent } from 'share/main/lib/util'
import * as window from 'share/main/lib/window'
import * as screencast from './screencast'
import * as devices from './devices'
import log from 'share/common/log'
import once from 'licia/once'
import { IpcGetStore, IpcSetStore } from 'share/common/types'
import isMac from 'licia/isMac'
import endWith from 'licia/endWith'

const logger = log('mainWin')

const store = getMainStore()

let win: BrowserWindow | null = null
let rendererGeneration = 0
const rendererUnavailableListeners = new Set<(generation: number) => void>()

export function onRendererUnavailable(listener: (generation: number) => void) {
  rendererUnavailableListeners.add(listener)
  return () => rendererUnavailableListeners.delete(listener)
}

function notifyRendererUnavailable() {
  rendererGeneration += 1
  for (const listener of rendererUnavailableListeners) {
    listener(rendererGeneration)
  }
}

export function getRendererGeneration(sender: WebContents) {
  if (!win || win.isDestroyed() || win.webContents !== sender) {
    return -1
  }
  return rendererGeneration
}

export function showWin() {
  logger.info('show')

  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) {
      win.restore()
    }
    if (!win.isVisible()) {
      win.show()
    }
    win.focus()
    return
  }
  win = null

  init()
  initIpc()

  win = window.create({
    name: 'main',
    minWidth: 960,
    minHeight: 640,
    width: 960,
    height: 640,
    menu: true,
  })

  win.on('close', (e) => {
    const screencastWin = window.getWin('screencast')
    if (screencastWin && screencastWin.isVisible()) {
      e.preventDefault()
      win?.hide()
    } else {
      app.quit()
    }
  })
  win.on('closed', () => {
    notifyRendererUnavailable()
    win = null
  })
  win.webContents.on('did-start-loading', notifyRendererUnavailable)
  win.webContents.on('render-process-gone', notifyRendererUnavailable)

  window.loadPage(win)
}

const init = once(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['ws://*/*'],
    },
    (details, callback) => {
      delete details.requestHeaders['Origin']
      callback({ requestHeaders: details.requestHeaders })
    }
  )
})

const initIpc = once(() => {
  handleEvent('setMainStore', <IpcSetStore>(
    ((name, val) => store.set(name, val))
  ))
  handleEvent('getMainStore', <IpcGetStore>((name) => store.get(name)))
  store.on('change', (name, val) => {
    window.sendAll('changeMainStore', name, val)
  })
  handleEvent('showScreencast', () => screencast.showWin())
  handleEvent('closeScreencast', () => screencast.closeWin())
  handleEvent('restartScreencast', () => {
    screencast.closeWin()
    screencast.showWin()
  })
  handleEvent('showDevices', () => devices.showWin())
  if (isMac) {
    app.on('open-file', (_, path) => {
      if (!endWith(path, '.apk')) {
        return
      }
      if (app.isReady()) {
        showWin()
        window.sendTo('main', 'installPackage', path)
      }
    })
  } else {
    app.on('second-instance', (_, argv) => {
      const apkPath = getOpenFileFromArgv(argv, '.apk')
      if (apkPath) {
        showWin()
        window.sendTo('main', 'installPackage', apkPath)
      }
    })
  }
})
