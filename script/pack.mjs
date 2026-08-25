import builder, { Platform } from 'electron-builder'
import isMac from 'licia/isMac.js'
import isWindows from 'licia/isWindows.js'

cd('dist')

const pkg = await fs.readJson('package.json')
const rootPkg = await fs.readJson('../package.json')
if (pkg.version !== rootPkg.version) {
  throw new Error(
    `Build version ${pkg.version} does not match package version ${rootPkg.version}. Run npm run build before packaging.`,
  )
}

const args = process.argv.slice(2)
const targetLinux = args.includes('--linux')
const targetWindows = args.includes('--win')

if (targetLinux && targetWindows) {
  throw new Error('Only one target platform can be packaged at a time')
}

let outputDir = `../release/${pkg.version}`
let targets
if (targetLinux) {
  outputDir += '/linux'
  targets = Platform.LINUX.createTarget(['AppImage'])
} else if (targetWindows) {
  outputDir += '/windows'
  targets = Platform.WINDOWS.createTarget(['nsis'])
}

let publishChannel = '${productName}-latest'
if (isMac && process.arch !== 'arm64') {
  publishChannel = '${productName}-latest-${arch}'
}

const config = {
  appId: pkg.appId,
  protocols: [
    {
      name: 'AYA-Plus URL Scheme',
      schemes: ['aya'],
      role: 'Viewer',
    },
  ],
  directories: {
    output: outputDir,
  },
  files: ['main', 'preload', 'renderer'],
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  extraResources: {
    from: 'resources',
    to: './',
    filter: ['**/*'],
  },
  nsis: {
    allowToChangeInstallationDirectory: true,
    oneClick: false,
    installerSidebar: 'build/installerSidebar.bmp',
    include: 'build/installer.nsh',
  },
  win: {
    target: [
      {
        target: 'nsis',
      },
    ],
  },
  mac: {
    electronLanguages: ['zh_CN', 'en'],
    target: [
      {
        target: 'dmg',
      },
    ],
    icon: 'build/icon.icns',
  },
  publish: {
    provider: 'generic',
    url: 'https://cnb.cool/scrmoa/other/aya/-/releases/latest/download/',
    channel: publishChannel,
  },
}

if (isMac) {
  const entitlements = {
    entitlements: 'build/entitlements.mas.plist',
    entitlementsInherit: 'build/entitlements.mas.inherit.plist',
  }
  if (args.includes('--mas-dev')) {
    config.mac.target = [
      {
        target: 'mas-dev',
      },
    ]
    config.masDev = {
      ...entitlements,
      provisioningProfile: 'build/mas-dev.provisionprofile',
    }
  } else if (args.includes('--mas')) {
    config.mac.target = [
      {
        target: 'mas',
      },
    ]
    config.mac.extendInfo = {
      LSMinimumSystemVersion: '12.0',
    }
    config.mas = {
      ...entitlements,
      provisioningProfile: 'build/mas.provisionprofile',
    }
  }
}

if (isWindows) {
  if (args.includes('--appx')) {
    config.win.target = [
      {
        target: 'appx',
      },
    ]
    config.appx = {
      identityName: 'LiriLiri.AYAAndroidManager',
      publisher: 'CN=B8CA87F2-EAEA-4C05-B38C-AAA50D3CBA24',
      publisherDisplayName: 'surunzi',
      displayName: 'AYA-Plus Android Manager',
    }
  }
}

await builder.build({ config, targets })
