import normalizePath from 'licia/normalizePath.js'
import path from 'path'

const args = process.argv.slice(2)
const platformArgIndex = args.indexOf('--platform')
const targetPlatform =
  platformArgIndex >= 0 ? args[platformArgIndex + 1] : process.platform
if (!['win32', 'darwin', 'linux'].includes(targetPlatform)) {
  throw new Error(`Unsupported platform: ${targetPlatform || '(empty)'}`)
}
const targetIsWindows = targetPlatform === 'win32'
const targetIsMac = targetPlatform === 'darwin'

const adbDir = resolve(__dirname, '../resources/adb')

await fs.emptyDir(adbDir)

const platformToolsPath = resolve(
  adbDir,
  `platform-tools-latest-${targetIsWindows ? 'windows' : targetIsMac ? 'darwin' : 'linux'}.zip`
)
const platformToolsDir = resolve(adbDir, 'platform-tools')
const downloadUrl = `https://dl.google.com/android/repository/platform-tools-latest-${
  targetIsWindows ? 'windows' : targetIsMac ? 'darwin' : 'linux'
}.zip`
await $`curl -Lk ${downloadUrl} > ${platformToolsPath}`
await $`unzip -o ${platformToolsPath} -d ${adbDir}`
await fs.remove(platformToolsPath)

let files = ['adb']
if (targetIsWindows) {
  files = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll']
}
for (let i = 0, len = files.length; i < len; i++) {
  const file = files[i]
  await fs.copy(resolve(platformToolsDir, file), resolve(adbDir, file))
}

await fs.remove(platformToolsDir)

function resolve(...args) {
  return normalizePath(path.resolve(...args))
}
