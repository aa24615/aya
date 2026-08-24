import { shell } from 'electron'

const releasesUrl = 'https://cnb.cool/scrmoa/other/aya/-/releases'

export function checkUpdate() {
  shell.openExternal(releasesUrl)
}
