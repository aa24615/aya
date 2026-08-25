import { app, ipcMain } from 'electron'
import path from 'node:path'
import sleep from 'licia/sleep'
import type { IDevice } from 'common/types'
import {
  AYA_URL_SCHEME,
  parseAyaDeepLink,
  type AyaDeepLinkCommand,
  type AyaDeepLinkParseResult,
  type IAyaDeepLinkDispatch,
} from 'common/deepLink'
import { normalizeRemoteDeviceId } from 'common/device'
import { isDev } from 'share/common/util'
import log from 'share/common/log'
import * as window from 'share/main/lib/window'
import { getMemStore } from 'share/main/lib/store'
import * as adb from './adb'
import {
  mergeConnectedDevices,
  upsertRemoteEndpoint,
} from './deviceCatalog'
import { getMainStore } from './store'
import * as mainWindow from '../window/main'
import * as devicesWindow from '../window/devices'
import * as screencastWindow from '../window/screencast'

type PendingDeepLink = AyaDeepLinkParseResult & {
  key: string
  revision: number
}

const logger = log('deepLink')
const MAX_PENDING_LINKS = 32
const pendingLinks: PendingDeepLink[] = []
const connectionTasks = new Map<string, Promise<void>>()
const mainStore = getMainStore()
const memStore = getMemStore()

let initialized = false
let serviceReady = false
let rendererReady = false
let processing = false
let quitting = false
let latestActivationRevision = 0
let rendererReadyWaiters: Array<() => void> = []

function isAyaUrl(value: string) {
  return value.trimStart().toLowerCase().startsWith(`${AYA_URL_SCHEME}:`)
}

function commandChangesMainState(command: AyaDeepLinkCommand) {
  return command.type !== 'devices' && command.type !== 'add'
}

function isStaleActivation(revision: number) {
  return Boolean(revision && revision !== latestActivationRevision)
}

function markRendererUnavailable() {
  rendererReady = false
}

function markRendererReady() {
  rendererReady = true
  const waiters = rendererReadyWaiters
  rendererReadyWaiters = []
  waiters.forEach((resolve) => resolve())
}

async function waitForRendererReady() {
  while (!rendererReady && !quitting) {
    await new Promise<void>((resolve) => rendererReadyWaiters.push(resolve))
  }
}

function enqueue(rawUrl: string) {
  if (quitting || !isAyaUrl(rawUrl)) {
    return false
  }
  const result = parseAyaDeepLink(rawUrl)
  const key = result.ok
    ? JSON.stringify(result.command)
    : `error:${result.error}`
  const changesMainState =
    result.ok && commandChangesMainState(result.command)
  const duplicateIndex = pendingLinks.findIndex(
    (pending) => pending.key === key
  )
  if (duplicateIndex >= 0) {
    if (!changesMainState) {
      return true
    }
    pendingLinks.splice(duplicateIndex, 1)
  }
  const revision =
    changesMainState ? ++latestActivationRevision : 0
  pendingLinks.push({ ...result, key, revision } as PendingDeepLink)
  if (pendingLinks.length > MAX_PENDING_LINKS) {
    pendingLinks.shift()
  }
  logger.info('queued', result.ok ? result.command.type : result.error)
  if (serviceReady) {
    mainWindow.showWin()
  }
  void drain()
  return true
}

function enqueueFromArgv(argv: string[]) {
  let handled = false
  for (const arg of argv) {
    if (isAyaUrl(arg)) {
      handled = enqueue(arg) || handled
    }
  }
  return handled
}

function registerProtocolClient() {
  if (process.mas || process.windowsStore) {
    return
  }
  // NSIS owns the production Windows registration (including all-users
  // installs). Registering again at runtime would create a stale HKCU entry
  // that survives an HKLM uninstall.
  if (process.platform === 'win32' && !isDev()) {
    return
  }
  let registered = false
  if (isDev() && process.argv[1]) {
    registered = app.setAsDefaultProtocolClient(
      AYA_URL_SCHEME,
      process.execPath,
      [path.resolve(process.argv[1])]
    )
  } else {
    registered = app.setAsDefaultProtocolClient(AYA_URL_SCHEME)
  }
  logger.info('protocol registration', registered)
}

export function init() {
  if (initialized) {
    return
  }
  initialized = true
  registerProtocolClient()
  enqueueFromArgv(process.argv)

  app.on('open-url', (event, url) => {
    if (isAyaUrl(url)) {
      event.preventDefault()
      enqueue(url)
    }
  })
  app.on('second-instance', (_, argv) => {
    if (!enqueueFromArgv(argv) && serviceReady) {
      mainWindow.showWin()
    }
  })
  app.on('activate', () => {
    if (serviceReady) {
      mainWindow.showWin()
    }
  })
  app.on('will-quit', () => {
    quitting = true
    pendingLinks.length = 0
    const waiters = rendererReadyWaiters
    rendererReadyWaiters = []
    waiters.forEach((resolve) => resolve())
  })
}

export function start() {
  if (serviceReady) {
    return
  }
  serviceReady = true
  mainWindow.onRendererUnavailable(markRendererUnavailable)
  ipcMain.handle('getDeepLinkGeneration', (event) =>
    mainWindow.getRendererGeneration(event.sender)
  )
  ipcMain.handle('deepLinkReady', (event, generation: number) => {
    const currentGeneration = mainWindow.getRendererGeneration(event.sender)
    if (currentGeneration < 0 || generation !== currentGeneration) {
      return false
    }
    markRendererReady()
    void drain()
    return true
  })
  if (pendingLinks.length > 0) {
    mainWindow.showWin()
  }
  void drain()
}

async function connectEndpoint(ip: string, port: number, id: string) {
  const running = connectionTasks.get(id)
  if (running) {
    return running
  }
  const task = adb.connectDevice(ip, port)
  connectionTasks.set(id, task)
  try {
    await task
  } finally {
    if (connectionTasks.get(id) === task) {
      connectionTasks.delete(id)
    }
  }
}

function findDevice(devices: IDevice[], deviceId: string) {
  const normalizedTarget = normalizeRemoteDeviceId(deviceId)
  return devices.find((device) => {
    if (normalizedTarget) {
      return normalizeRemoteDeviceId(device.id) === normalizedTarget
    }
    return device.id === deviceId
  })
}

function publishDevices(devices: IDevice[]) {
  mergeConnectedDevices(devices)
  memStore.set('devices', devices)
  window.sendTo('devices', 'reloadDevicesCatalog')
}

async function resolveDevice(command: AyaDeepLinkCommand) {
  let deviceId = 'deviceId' in command ? command.deviceId : undefined
  if (!deviceId && command.type === 'screencast') {
    const current = mainStore.get('device') as IDevice | null
    deviceId = current?.id
  }
  if (!deviceId) {
    return { device: null, devices: [] as IDevice[] }
  }

  let devices: IDevice[] = []
  try {
    devices = await adb.getDevices()
  } catch {
    if (!('endpoint' in command) || !command.endpoint) {
      throw new Error('Unable to query devices')
    }
  }
  let device = findDevice(devices, deviceId)

  if (!device && 'endpoint' in command && command.endpoint) {
    await connectEndpoint(
      command.endpoint.ip,
      command.endpoint.port,
      command.endpoint.id
    )
    for (let attempt = 0; attempt < 4 && !device; attempt++) {
      devices = await adb.getDevices()
      device = findDevice(devices, deviceId)
      if (!device && attempt < 3) {
        await sleep(250)
      }
    }
  }

  publishDevices(devices)
  return { device: device || null, devices }
}

async function sendError(error: string, revision = 0) {
  await waitForRendererReady()
  if (quitting || isStaleActivation(revision)) {
    return
  }
  mainWindow.showWin()
  window.sendTo('main', 'ayaDeepLinkError', error)
}

async function execute(
  command: AyaDeepLinkCommand,
  revision: number
) {
  if (command.type === 'devices') {
    devicesWindow.showWin()
    return
  }

  if ('endpoint' in command && command.endpoint) {
    upsertRemoteEndpoint({
      id: command.endpoint.id,
      ...('deviceName' in command && command.deviceName !== undefined
        ? { deviceName: command.deviceName }
        : {}),
      ...('remark' in command && command.remark !== undefined
        ? { remark: command.remark }
        : {}),
    })
    window.sendTo('devices', 'reloadDevicesCatalog')
  }

  if (command.type === 'add') {
    devicesWindow.showWin()
    try {
      const { device, devices } = await resolveDevice(command)
      await waitForRendererReady()
      if (!quitting) {
        window.sendTo('main', 'syncDevices', devices)
      }
      if (!device) {
        await sendError('device-unavailable')
      }
    } catch {
      await sendError('device-unavailable')
    }
    return
  }

  let devices: IDevice[] | undefined
  let device: IDevice | null = null
  const needsDevice = Boolean(command.deviceId) || command.type === 'screencast'
  if (needsDevice) {
    try {
      const resolved = await resolveDevice(command)
      devices = resolved.devices
      device = resolved.device
    } catch {
      if (!isStaleActivation(revision)) {
        await sendError('action-failed', revision)
      }
      return
    }
    if (!device) {
      if (isStaleActivation(revision)) {
        return
      }
      if ('endpoint' in command && command.endpoint) {
        devicesWindow.showWin()
      }
      await sendError('device-unavailable', revision)
      return
    }
  }

  if (isStaleActivation(revision)) {
    return
  }

  await waitForRendererReady()
  if (quitting || isStaleActivation(revision)) {
    return
  }

  mainWindow.showWin()
  if (device) {
    const current = mainStore.get('device') as IDevice | null
    if (current?.id !== device.id) {
      mainStore.set('device', device)
    }
  }
  if (command.type === 'panel') {
    mainStore.set('panel', command.panel)
  }
  const dispatch: IAyaDeepLinkDispatch = { command, devices }
  window.sendTo('main', 'ayaDeepLinkCommand', dispatch)

  if (command.type === 'screencast') {
    screencastWindow.showWin()
  }
}

async function drain() {
  if (!serviceReady || !rendererReady || processing || quitting) {
    return
  }
  processing = true
  try {
    while (pendingLinks.length > 0 && !quitting) {
      const pending = pendingLinks.shift()!
      if (!pending.ok) {
        await sendError(pending.error)
        continue
      }
      if (
        pending.revision &&
        pending.revision !== latestActivationRevision
      ) {
        continue
      }
      try {
        await execute(pending.command, pending.revision)
      } catch (error) {
        logger.error('execute failed', error)
        if (!isStaleActivation(pending.revision)) {
          await sendError('action-failed', pending.revision)
        }
      }
    }
  } finally {
    processing = false
    if (pendingLinks.length > 0) {
      void drain()
    }
  }
}
