import { app } from 'electron'
import * as menu from './lib/menu'
import * as main from './window/main'
import * as adb from './lib/adb'
import * as terminal from 'share/main/window/terminal'
import * as window from 'share/main/lib/window'
import log from 'share/common/log'
import { getSettingsStore } from './lib/store'
import * as deepLink from './lib/deepLink'
import 'share/main'

const logger = log('main')
logger.info('start')

const settingsStore = getSettingsStore()
window.setDefaultOptions({
  customTitlebar: !settingsStore.get('useNativeTitlebar'),
})

deepLink.init()

app.on('ready', async () => {
  logger.info('app ready')

  terminal.init()
  await adb.init()
  deepLink.start()
  main.showWin()
  menu.init()
})
