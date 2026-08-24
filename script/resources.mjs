import normalizePath from 'licia/normalizePath.js'
import path from 'path'

const sourceDir = normalizePath(path.resolve(__dirname, '../resources'))
const targetDir = normalizePath(path.resolve(__dirname, '../dist/resources'))

await fs.emptyDir(targetDir)
await fs.copy(sourceDir, targetDir)
