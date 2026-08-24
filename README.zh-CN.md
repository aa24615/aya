<div align="center">
  <a href="https://aya.liriliri.io/" target="_blank">
    <img src="https://aya.liriliri.io/icon.png" width="400">
  </a>
</div>

<h1 align="center">AYA</h1>

<div align="center">

[English](README.md) | [简体中文](README.zh-CN.md)

Android ADB 桌面管理工具。

[![Windows][windows-image]][release-url]
[![macOS][mac-image]][release-url]
[![Linux][linux-image]][release-url]
[![Downloads][download-image]][release-url]
![License][license-image]

</div>

[windows-image]: https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=windows
[mac-image]: https://img.shields.io/badge/-macOS-black?style=flat-square&logo=macos
[linux-image]: https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux
[download-image]: https://img.shields.io/github/downloads/liriliri/aya/total?style=flat-square
[release-url]: https://github.com/liriliri/aya/releases
[license-image]: https://img.shields.io/github/license/liriliri/aya?style=flat-square

<img src="https://aya.liriliri.io/screencast.png" style="width:100%">

[AYA](https://aya.liriliri.io/) 是一款用于管理和控制 Android 设备的桌面应用，可以理解为 ADB 的图形化操作界面。它保留了命令行 ADB 的设备连接能力，同时提供投屏、文件、应用、进程、性能、日志和终端等可视化工具。

## 安装

可以从 [AYA 官方 Releases](https://github.com/liriliri/aya/releases/) 下载并安装，支持：

- Windows x64
- macOS arm64
- macOS x64
- Linux x86_64

本仓库还提供 CNB 手动构建流程，可在 CNB 分支详情页点击 **构建新版本**，生成 Linux AppImage 与 Windows NSIS 安装包。具体说明见 [CNB 构建发版文档](.cnb/README.md)。

## 功能

<img src="https://aya.liriliri.io/screenshot.png" style="width:100%">

- Android 设备发现与有线、无线 ADB 连接
- 设备投屏和远程控制
- 截图与录屏
- 文件浏览与传输
- 应用安装、卸载和管理
- 进程监控
- 页面布局检查
- CPU、内存、温度和 FPS 监控
- Logcat 日志查看
- 交互式 Shell 终端
- ADB 端口转发与反向代理
- 自定义设备名称和备注
- CSV 导入、导出设备列表

## 设备名称、备注与 CSV 管理

### 字段说明

设备管理列表保留 ADB 自动读取的系统信息，并新增两个由用户维护的字段：

| 字段 | 说明 |
| --- | --- |
| 型号 | Android 系统上报的市场名称或硬件型号，不能作为自定义名称覆盖 |
| 设备名称 | 用户自定义名称，例如“前台签到机”“会议室测试机” |
| 备注 | 记录安装位置、负责人、用途、故障情况等补充信息 |

设备名称和备注保存在 AYA 本地数据中。设备有序列号时优先按序列号关联，因此同一设备从 USB 切换到无线 ADB 后仍可继续使用原有名称和备注。

### 修改设备名称和备注

1. 打开 **设备管理器**。
2. 在设备列表中单击需要修改的设备。
3. 点击工具栏中的 **修改**。
4. 填写 **设备名称** 和 **备注**。
5. 点击 **保存**。

设备名称和备注都允许留空；保存空值可清除原来的内容。

### 导出现有设备

1. 打开 **设备管理器**。
2. 点击工具栏中的 **导出 CSV**。
3. 选择保存位置并确认。

导出的 CSV 使用 UTF-8 BOM 编码，可直接使用 Excel 打开。导出文件是包含设备系统信息的完整备份格式，也可以重新导入。

导出列如下：

| 列名 | 是否可导入 | 说明 |
| --- | --- | --- |
| `ID` | 是，必填 | ADB 设备 ID；网络设备通常为 `IP:端口` |
| `序列号` | 是 | 设备硬件序列号，用于稳定关联名称和备注 |
| `型号` | 是 | ADB 上报的设备型号 |
| `设备名称` | 是 | 用户维护的自定义名称 |
| `备注` | 是 | 用户维护的备注，可包含逗号和换行 |
| `Android 版本` | 是 | Android 系统版本 |
| `SDK 版本` | 是 | Android API/SDK 版本 |
| `状态` | 否 | 导出时的在线或离线状态，仅供查看 |

### 导入设备列表

1. 准备包含 `设备名称、IP地址、端口、备注` 四列表头的 CSV 文件。
2. 确保每台设备的 IPv4 地址和 ADB 连接端口正确。
3. 在设备管理器中点击 **导入 CSV**。
4. 选择 CSV 文件。
5. AYA 会自动执行 ADB 连接；连接成功后自动读取型号、序列号、Android 版本和 SDK 版本。
6. 导入完成后根据提示检查连接成功和失败的设备数量。

导入规则：

- 推荐模板必须包含 `设备名称、IP地址、端口、备注` 四列，列顺序可以调整。
- `IP地址` 必须是有效的 IPv4 地址；`端口` 必须是 `1-65535` 之间的整数。
- AYA 会把 IP 和端口组合成内部设备 ID，例如 `192.168.1.10` 和 `5555` 会转换为 `192.168.1.10:5555`。
- 导入只执行 `adb connect`。目标设备必须已经开启 ADB TCP，或者已经在本机完成无线调试配对；这里的端口是连接端口，不是配对端口。
- 连接成功后，型号、序列号、Android 版本和 SDK 版本以设备实时返回的数据为准，不需要填写在四列模板中。
- 连接失败的设备仍会保存为离线远程设备，并保留设备名称和备注，之后可以在设备管理器中重新连接。
- AYA 导出的旧完整备份格式仍然兼容；这类文件继续使用 `ID` 列恢复全部已保存字段。
- 支持中文或英文表头，不区分大小写、空格、下划线和连字符。
- 已存在的设备会按 ID 匹配；提供序列号时也会按序列号关联名称和备注。
- 对于 USB 设备的离线备份，建议保留导出文件中的 `序列号`，这样设备再次连接后才能稳定恢复名称和备注。
- CSV 中包含“设备名称”或“备注”列时，空单元格会清除对应旧值；完全不提供该列则保留旧值。
- 支持带 UTF-8 BOM 的文件、双引号转义、包含逗号的字段以及多行备注。
- 重复导入同一 IP 和端口不会创建重复设备，单次导入只会连接一次，并使用最后一行的名称和备注。

推荐导入示例：

```csv
设备名称,IP地址,端口,备注
前台签到机,192.168.1.10,5555,一楼大厅
会议室测试机,192.168.1.11,5555,"二楼会议室,仅用于测试"
```

兼容的旧完整备份示例：

```csv
ID,序列号,型号,设备名称,备注,Android 版本,SDK 版本
192.168.1.10:5555,SN001,Pixel 8,前台签到机,一楼大厅,14,34
```

## 开发与构建

项目主要使用 Electron、React、TypeScript、MobX、Vite 和 Electron Builder，并包含一个用于设备端能力的 Android 服务模块。

共享代码和图标资源已经内置在仓库中，首次拉取后可直接安装依赖：

```bash
npm install
```

内置资源对应以下上游版本。将资源直接纳入主仓库，可避免 CNB 构建节点因无法连接 GitHub 而在源码准备阶段失败：

- `src/share`：[liriliri/electron-share](https://github.com/liriliri/electron-share)，提交 `aab42a842827d4d81f5b4c77eaa6b63ee55fe509`。
- `src/renderer/icon`：[liriliri/icon-share](https://github.com/liriliri/icon-share)，提交 `b463613b5ad5829131ab73268cfdc8910869a1d5`。

常用命令：

```bash
# 开发模式
npm run dev

# 类型检查与代码检查
npx tsc --noEmit
npm run lint

# 准备 ADB、Android 服务和 scrcpy 资源
npm run adb
npm run server
npm run scrcpy

# 生产构建与当前平台打包
npm run build
npm run pack
```

## 相关项目

- [licia](https://github.com/liriliri/licia)：AYA 使用的 JavaScript 工具库。
- [luna](https://github.com/liriliri/luna)：AYA 使用的 UI 组件库。
- [vivy](https://github.com/liriliri/vivy)：图标生成工具。
- [echo](https://github.com/liriliri/echo)：HarmonyOS 版本的设备管理工具。

## 贡献

开发环境与贡献方式可参考 [官方贡献指南](https://aya.liriliri.io/guide/contributing.html)。

## 许可证

本项目使用 [AGPL-3.0](LICENSE) 许可证。
