export const MAIN_PANELS = [
  'overview',
  'file',
  'application',
  'process',
  'performance',
  'shell',
  'layout',
  'screenshot',
  'logcat',
  'webview',
] as const

export type MainPanel = (typeof MAIN_PANELS)[number]

export function isMainPanel(value: unknown): value is MainPanel {
  return MAIN_PANELS.includes(value as MainPanel)
}
