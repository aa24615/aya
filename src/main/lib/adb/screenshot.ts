import type { Client } from '@devicefarmer/adbkit'
import { app } from 'electron'
import fs from 'fs-extra'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import childProcess from 'node:child_process'
import {
  IDeviceScreenshotCache,
  IDeviceScreenshotCacheUpdate,
  IpcCaptureDeviceScreenshot,
  IpcGetCachedDeviceScreenshot,
  IpcScreencap,
} from 'common/types'
import { getDeviceScreenshotCacheKey } from 'common/device'
import { getUserDataPath, handleEvent } from 'share/main/lib/util'
import * as window from 'share/main/lib/window'
import log from 'share/common/log'

const logger = log('adbScreenshot')
const CACHE_DIR = getUserDataPath('data/screenshots')
const REFRESH_INTERVAL = 60 * 1000
const CAPTURE_TIMEOUT = 30 * 1000
const CAPTURE_CONCURRENCY = 3
const MAX_ADB_OUTPUT_SIZE = 64 * 1024 * 1024

let adbBin = 'adb'
let adbServerArgs: string[] = []
let refreshTimer: ReturnType<typeof setInterval> | null = null
let automaticRefresh: Promise<void> | null = null
const captureTasks = new Map<string, Promise<IDeviceScreenshotCache>>()

class ConcurrencyQueue {
  private activeCount = 0
  private pendingTasks: Array<() => void> = []

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pendingTasks.push(() => {
        this.activeCount += 1
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            this.activeCount -= 1
            this.startTasks()
          })
      })
      this.startTasks()
    })
  }

  private startTasks() {
    while (
      this.activeCount < CAPTURE_CONCURRENCY &&
      this.pendingTasks.length > 0
    ) {
      this.pendingTasks.shift()?.()
    }
  }
}

const captureQueue = new ConcurrencyQueue()

/** 初始化截图 IPC、磁盘缓存和应用级的一分钟自动刷新任务。 */
export function init(adbClient: Client) {
  adbBin = adbClient.bin
  adbServerArgs = getAdbServerArgs(adbClient)
  fs.ensureDirSync(CACHE_DIR)
  cleanupTemporaryFiles()

  handleEvent('getCachedDeviceScreenshot', getCachedDeviceScreenshot)
  handleEvent('captureDeviceScreenshot', captureDeviceScreenshot)

  refreshTimer = setInterval(() => {
    void refreshOnlineDeviceScreenshots()
  }, REFRESH_INTERVAL)

  app.once('will-quit', () => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  })
}

/** 获取设备当前画面，不读取或写入磁盘缓存。 */
export const screencap: IpcScreencap = async function (deviceId) {
  const buffer = await captureBuffer(deviceId)
  return buffer.toString('base64')
}

/** 只读取本地缓存；缓存不存在时返回 null，绝不会触发 ADB 截图。 */
export const getCachedDeviceScreenshot: IpcGetCachedDeviceScreenshot =
  async function (deviceId) {
    const cacheKey = getDeviceScreenshotCacheKey(deviceId)
    const filePath = getCacheFilePath(cacheKey)
    let fileHandle
    try {
      // 同一个文件句柄读取内容与时间，避免覆盖瞬间拼出“旧图 + 新时间”。
      fileHandle = await open(filePath, 'r')
      const [buffer, stat] = await Promise.all([
        fileHandle.readFile(),
        fileHandle.stat(),
      ])
      if (!isPng(buffer)) {
        return null
      }
      return {
        cacheKey,
        data: buffer.toString('base64'),
        updatedAt: stat.mtimeMs,
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return null
      }
      throw error
    } finally {
      await fileHandle?.close().catch(() => undefined)
    }
  }

/** 实时抓取一张设备截图并原子覆盖该设备唯一的 PNG 缓存。 */
export const captureDeviceScreenshot: IpcCaptureDeviceScreenshot =
  async function (deviceId) {
    return queueCachedScreenshot(deviceId, true)
  }

function queueCachedScreenshot(deviceId: string, manual: boolean) {
  const cacheKey = getDeviceScreenshotCacheKey(deviceId)
  const runningTask = captureTasks.get(cacheKey)
  if (runningTask && !manual) {
    return runningTask
  }

  // 手动更新若遇到后台任务，会在其结束后再实时抓取一张，而不是复用旧任务。
  const startCapture = () =>
    captureQueue.run(async () => {
      const buffer = await captureBuffer(deviceId)
      if (!isPng(buffer)) {
        throw new Error(`Invalid screenshot data: ${deviceId}`)
      }
      const filePath = getCacheFilePath(cacheKey)
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`
      await fs.writeFile(temporaryPath, buffer, { mode: 0o600 })
      try {
        // 同目录 rename 不会先删除旧图；失败或进程退出时旧缓存仍然完整。
        await fs.rename(temporaryPath, filePath)
      } finally {
        await fs.remove(temporaryPath).catch(() => undefined)
      }

      const stat = await fs.stat(filePath)
      const cachedScreenshot: IDeviceScreenshotCache = {
        cacheKey,
        data: buffer.toString('base64'),
        updatedAt: stat.mtimeMs,
      }
      const update: IDeviceScreenshotCacheUpdate = {
        cacheKey,
        updatedAt: cachedScreenshot.updatedAt,
      }
      try {
        window.sendAll('deviceScreenshotUpdated', update)
      } catch (error) {
        // 窗口恰好关闭时，通知失败不能反转已经成功的截图与落盘结果。
        logger.error('broadcast screenshot cache update failed', error)
      }
      return cachedScreenshot
    })

  const task = runningTask
    ? runningTask.catch(() => undefined).then(startCapture)
    : startCapture()
  captureTasks.set(cacheKey, task)
  const cleanup = () => {
    if (captureTasks.get(cacheKey) === task) {
      captureTasks.delete(cacheKey)
    }
  }
  void task.then(cleanup, cleanup)
  return task
}

async function captureBuffer(deviceId: string) {
  const { stdout } = await runAdb([
    ...adbServerArgs,
    '-s',
    deviceId,
    'exec-out',
    'screencap',
    '-p',
  ])
  return normalizeScreencapBuffer(stdout)
}

/** 兼容旧设备通过 ADB shell 输出二进制时把 LF 转为 CRLF 的行为。 */
function normalizeScreencapBuffer(buffer: Buffer) {
  if (isPng(buffer)) {
    return buffer
  }

  const normalized = Buffer.allocUnsafe(buffer.length)
  let targetIndex = 0
  for (let sourceIndex = 0; sourceIndex < buffer.length; sourceIndex++) {
    if (
      buffer[sourceIndex] === 0x0d &&
      buffer[sourceIndex + 1] === 0x0a
    ) {
      normalized[targetIndex++] = 0x0a
      sourceIndex += 1
    } else {
      normalized[targetIndex++] = buffer[sourceIndex]
    }
  }
  return normalized.subarray(0, targetIndex)
}

/**
 * 每分钟刷新一次全部在线设备。上一轮尚未结束时跳过本轮，避免任务堆积；
 * 外层 worker 只会逐步补充三个任务，因此手动截图不会排在整批设备之后。
 */
function refreshOnlineDeviceScreenshots() {
  if (automaticRefresh) {
    return automaticRefresh
  }
  automaticRefresh = (async () => {
    const { stdout } = await runAdb([...adbServerArgs, 'devices'])
    const seenCacheKeys = new Set<string>()
    const deviceIds = stdout
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 2 && parts[1] === 'device')
      .map((parts) => parts[0])
      .filter((deviceId) => {
        const cacheKey = getDeviceScreenshotCacheKey(deviceId)
        if (seenCacheKeys.has(cacheKey)) {
          return false
        }
        seenCacheKeys.add(cacheKey)
        return true
      })

    let nextIndex = 0
    const workers = Array.from(
      { length: Math.min(CAPTURE_CONCURRENCY, deviceIds.length) },
      async () => {
        while (nextIndex < deviceIds.length) {
          const deviceId = deviceIds[nextIndex++]
          try {
            await queueCachedScreenshot(deviceId, false)
          } catch (error) {
            logger.error(`automatic screenshot failed: ${deviceId}`, error)
          }
        }
      }
    )
    await Promise.all(workers)
  })()
    .catch((error) => {
      logger.error('automatic screenshot refresh failed', error)
    })
    .finally(() => {
      automaticRefresh = null
    })
  return automaticRefresh
}

function getAdbServerArgs(adbClient: Client) {
  const args: string[] = []
  if (adbClient.host && adbClient.host !== '127.0.0.1') {
    args.push('-H', adbClient.host)
  }
  const port = Number(adbClient.port)
  if (Number.isFinite(port) && port !== 5037) {
    args.push('-P', String(port))
  }
  return args
}

/**
 * 使用可终止的 adb 子进程执行周期任务。超时会先终止进程，再在短暂宽限后
 * 强制结束，避免长期定时任务在 ADB 连接建立阶段积累悬挂操作。
 */
function runAdb(args: string[]) {
  return new Promise<{ stdout: Buffer; stderr: string }>((resolve, reject) => {
    const child = childProcess.spawn(adbBin, args, {
      env: { ...process.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutSize = 0
    let stderrSize = 0
    let settled = false
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      clearTimeout(timeout)
      if (forceKillTimer) {
        clearTimeout(forceKillTimer)
        forceKillTimer = null
      }
    }
    const fail = (error: Error, kill = false) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (kill && child.exitCode === null) {
        child.kill()
        forceKillTimer = setTimeout(() => {
          if (child.exitCode === null) {
            child.kill('SIGKILL')
          }
        }, 1000)
        forceKillTimer.unref()
      }
      reject(error)
    }
    const timeout = setTimeout(() => {
      fail(new Error(`ADB command timed out: ${args.join(' ')}`), true)
    }, CAPTURE_TIMEOUT)

    child.stdout?.on('data', (chunk: Buffer) => {
      if (settled) {
        return
      }
      stdoutSize += chunk.length
      if (stdoutSize + stderrSize > MAX_ADB_OUTPUT_SIZE) {
        fail(new Error('ADB command output exceeded the size limit'), true)
        return
      }
      stdoutChunks.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (settled) {
        return
      }
      stderrSize += chunk.length
      if (stdoutSize + stderrSize > MAX_ADB_OUTPUT_SIZE) {
        fail(new Error('ADB command output exceeded the size limit'), true)
        return
      }
      stderrChunks.push(chunk)
    })
    child.once('error', (error) => fail(error))
    child.once('close', (code) => {
      if (settled) {
        cleanup()
        return
      }
      settled = true
      cleanup()
      const stderr = Buffer.concat(stderrChunks).toString().trim()
      if (code !== 0) {
        reject(new Error(stderr || `ADB command exited with code ${code}`))
        return
      }
      resolve({ stdout: Buffer.concat(stdoutChunks), stderr })
    })
  })
}

function getCacheFilePath(cacheKey: string) {
  return path.join(CACHE_DIR, `${cacheKey}.png`)
}

function cleanupTemporaryFiles() {
  for (const fileName of fs.readdirSync(CACHE_DIR)) {
    if (fileName.endsWith('.tmp')) {
      fs.removeSync(path.join(CACHE_DIR, fileName))
    }
  }
}

function isPng(buffer: Buffer) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])
  const endChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ])
  return (
    buffer.length >= signature.length + endChunk.length &&
    buffer.subarray(0, signature.length).equals(signature) &&
    buffer.subarray(-endChunk.length).equals(endChunk)
  )
}
