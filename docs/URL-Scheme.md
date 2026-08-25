# AYA-Plus URL Scheme 使用文档

[返回中文 README](../README.zh-CN.md)

AYA-Plus 从 `1.14.8` 开始支持 `aya://` 快捷链接。浏览器、业务系统、脚本或其他桌面程序可以通过链接唤起 AYA-Plus，并执行经过白名单限制的设备操作。

本文档描述当前支持的链接格式、参数、执行规则和系统集成方式。

- 适用版本：AYA-Plus `1.14.8` 及以上
- 协议名称：`aya`
- 调用方向：外部系统单向唤起 AYA-Plus

## 目录

- [快速示例](#快速示例)
- [设备唯一规则](#设备唯一规则)
- [操作说明](#操作说明)
- [参数说明](#参数说明)
- [URL 编码](#url-编码)
- [网页与业务系统接入](#网页与业务系统接入)
- [各系统测试方法](#各系统测试方法)
- [执行顺序与并发行为](#执行顺序与并发行为)
- [安全限制](#安全限制)
- [常见问题](#常见问题)

## 快速示例

```text
# 导入一台无线 ADB 设备
aya://list/add?ip=192.168.2.15&port=5555

# 导入设备并设置名称、备注
aya://list/add?ip=192.168.2.15&port=5555&name=%E6%95%99%E5%AE%A4%E5%A4%A7%E5%B1%8F&remark=%E4%B8%80%E6%A5%BC

# 选中设备，将主界面切换到该设备
aya://device/select?ip=192.168.2.15&port=5555

# 选中设备并打开投屏
aya://screencast?ip=192.168.2.15&port=5555

# 选中设备并打开缓存截图页
aya://main/screenshot?ip=192.168.2.15&port=5555

# 打开设备管理器
aya://devices
```

`port` 可以省略或留空，默认值为 `5555`：

```text
aya://device/select?ip=192.168.2.15
```

## 设备唯一规则

无线 ADB 设备以规范化后的 `IP:端口` 作为唯一标识。

- `192.168.2.15:5555` 与 `192.168.2.15:05555` 会被视为同一设备。
- 已存在的端点会直接复用，不会重复新增。
- 不存在的端点会先保存到设备管理器，再尝试 ADB 连接。
- 连接失败时设备仍会保留，并显示为离线；链接不会改为操作其他设备。
- 链接明确提供 `name` 或 `remark` 时，会覆盖该端点原有的设备名称或备注。
- 链接没有提供名称或备注时，会保留原值。
- 显式传入空值，例如 `name=`，表示清空对应内容。

当前 `ip` 参数只接受 IPv4 地址，端口范围为 `1` 至 `65535`。

## 操作说明

### 导入单台设备

推荐格式：

```text
aya://list/add?ip=<IPv4>&port=<端口>&name=<设备名称>&remark=<备注>
```

示例：

```text
aya://list/add?ip=10.0.0.8&port=5555&name=%E5%89%8D%E5%8F%B0%E5%B1%8F&remark=A%E5%8C%BA
```

执行过程：

1. 按 `IP:端口` 保存或更新设备端点及显式提供的名称、备注。
2. 立即打开设备管理器。
3. 查询当前 ADB 设备列表。
4. 目标尚未在线时才尝试连接无线 ADB。
5. 连接完成后同步刷新设备列表和在线状态。

添加操作不会自动把该设备选为主界面当前设备。需要同时切换设备时，请使用“选中设备”链接。

支持的操作别名如下。这里仅列路由，实际调用时仍必须通过 `ip` 提供无线端点（`port` 可选），或直接传入 `device=IP%3A端口`；两种形式都可以附带 `name`、`remark`：

```text
aya://list/add
aya://device/add
aya://add
aya://列表/添加
aya://设备/添加
aya://导入设备
```

导入操作只支持无线 IPv4 端点，端口可以省略并默认使用 `5555`。无论 USB 或模拟器当前在线还是离线，都不能通过 add 路由导入其设备 ID。

### 选中设备

```text
aya://device/select?ip=192.168.2.15&port=5555
```

执行成功后，主界面会切换到该设备。目标端点不存在时，会先按导入设备的规则保存并连接。

支持的操作别名如下。这里仅列路由，实际调用时仍必须附带 `ip` 或完整 `device`；USB、模拟器 ID 必须已经在线：

```text
aya://device/select
aya://select
aya://switch
aya://设备/选择
aya://选中
aya://切换设备
```

### 打开投屏

指定无线设备：

```text
aya://screencast?ip=192.168.2.15&port=5555
```

指定已在线的 USB 或模拟器：

```text
aya://screencast?device=emulator-5554
```

不指定设备时，会使用主界面当前选中的设备：

```text
aya://screencast
```

支持的操作别名：

```text
aya://screencast
aya://cast
aya://screen
aya://投屏
```

如果无线目标设备离线且无法重新连接，AYA-Plus 会保留网络端点记录并显示错误，不会打开错误设备的投屏。不存在的 USB 或模拟器 ID 不会被新增为离线记录。

### 切换主界面页面

完整格式：

```text
aya://main/<页面名>
aya://main/<页面名>?ip=<IPv4>&port=<端口>
```

支持的页面：

| 页面名 | 功能 |
| --- | --- |
| `overview` | 设备概览 |
| `file` | 文件管理 |
| `application` | 应用管理 |
| `process` | 进程管理 |
| `performance` | 性能监控 |
| `shell` | ADB Shell |
| `layout` | 界面布局 |
| `screenshot` | 缓存截图 |
| `logcat` | Logcat 日志 |
| `webview` | WebView 调试 |

示例：

```text
aya://main/overview?ip=192.168.2.15&port=5555
aya://main/file?ip=192.168.2.15&port=5555
aya://main/application?ip=192.168.2.15&port=5555
aya://main/screenshot?ip=192.168.2.15&port=5555
```

全部 10 个页面都支持 `aya://panel/<页面名>` 和直接使用 `aya://<页面名>` 的简写，例如：

```text
aya://panel/screenshot?ip=192.168.2.15&port=5555
aya://screenshot?ip=192.168.2.15&port=5555
```

截图链接只打开本地缓存截图，不会实时重新截图。需要最新画面时，仍需在界面中手动点击更新截图。

### 打开主界面

```text
aya://open
aya://main
```

`aya://open` 只唤起主界面，不改变当前页面。`aya://main` 会打开主界面的设备概览页。

也可以在打开主界面的同时选中设备：

```text
aya://open?ip=192.168.2.15&port=5555
```

### 打开设备管理器

```text
aya://devices
```

支持的操作别名：

```text
aya://devices
aya://device-manager
aya://list
aya://设备管理
aya://设备列表
```

打开设备管理器的链接不接受设备或其他查询参数。

## 参数说明

| 参数 | 说明 | 限制 |
| --- | --- | --- |
| `ip` | 无线 ADB 设备的 IPv4 地址 | 例如 `192.168.2.15` |
| `port` | 无线 ADB 端口 | 可省略或留空，默认 `5555`；范围 `1-65535` |
| `device` | 完整 ADB 设备 ID | 可使用编码后的 `IP:端口`、USB ID 或模拟器 ID |
| `name` | 设备名称 | 最长 100 个字符，只适用于无线端点 |
| `remark` | 设备备注 | 最长 500 个字符，只适用于无线端点 |

参数兼容别名：

- `device`：也支持 `id`、`设备`。
- `name`：也支持 `deviceName`、`device_name`、`设备名称`。
- `remark`：也支持 `备注`。

完整设备 ID 示例：

```text
# 冒号经过 URL 编码
aya://device/select?device=192.168.2.15%3A5555

# 已在线的模拟器
aya://device/select?device=emulator-5554
```

参数规则：

- `ip` 和 `device` 可以二选一；同时提供时，两者必须指向完全相同的无线端点。
- 不能单独提供 `port`。
- 同义参数不能重复，例如不能同时提供 `name` 和 `deviceName`。
- `name` 和 `remark` 只能与无线端点一起使用。
- 查询参数名称区分大小写，请使用本文档列出的写法。
- 未列出的参数会使整条链接被拒绝。例如 `aya://select?ip=192.168.2.15&xx=1` 不会忽略 `xx`，而是直接报参数无效。
- 路由中的 ASCII 字母不区分大小写，但仍建议使用本文档中的小写规范格式。

## URL 编码

设备名称、备注和完整设备 ID 应进行 URL 编码。推荐使用标准 `encodeURIComponent()`：

```js
const url = new URL('aya://list/add')
url.searchParams.set('ip', '192.168.2.15')
url.searchParams.set('port', '5555')
url.searchParams.set('name', '教室大屏')
url.searchParams.set('remark', '一楼')

console.log(url.toString())
```

常见编码：

| 原始字符 | 编码后 |
| --- | --- |
| 空格 | `%20` |
| `:` | `%3A` |
| 中文 | UTF-8 百分号编码 |

查询参数中的 `+` 会被当作空格。需要传递字面量加号时，应编码为 `%2B`。

在终端中调用时，应使用单引号包住完整 URL，防止 `&` 被 Shell 当成命令分隔符。

## 网页与业务系统接入

HTML 链接：

```html
<a href="aya://device/select?ip=192.168.2.15&amp;port=5555">
  在 AYA-Plus 中打开设备
</a>
```

JavaScript：

```js
const url = new URL('aya://screencast')
url.searchParams.set('ip', '192.168.2.15')
url.searchParams.set('port', '5555')
window.location.href = url.toString()
```

浏览器通常会在首次打开外部应用时显示确认提示，这是正常的安全行为。

`aya://` 是单向唤起协议，目前不提供 `callback`、`return_url` 或网页回调。调用方只能确认链接已发出，不能直接从浏览器获知设备是否连接或动作是否成功；实际结果会在 AYA-Plus 界面中显示。上述未支持的回调参数如果被附加到链接，也会因为不在参数白名单中而被拒绝。

## 各系统测试方法

### macOS

安装 AYA-Plus 后执行：

```bash
open 'aya://device/select?ip=192.168.2.15&port=5555'
```

### Windows

在 PowerShell 中执行：

```powershell
Start-Process -FilePath 'aya://device/select?ip=192.168.2.15&port=5555'
```

也可以在“运行”窗口中直接输入 `aya://devices`。NSIS 安装版会根据当前用户或所有用户安装模式注册协议；单独解压的可执行文件不会代替安装器完成正式注册。

### Linux

```bash
xdg-open 'aya://device/select?ip=192.168.2.15&port=5555'
```

AppImage 是否可以直接响应协议，取决于当前桌面环境是否已经完成 AppImage 的桌面与 MIME 集成。

## 执行顺序与并发行为

- 冷启动时收到的链接会暂存，直到主界面完成初始化后再执行。
- 应用已经运行时，新的链接会交给现有实例处理，不会启动多个 AYA-Plus 主进程。
- 快速连续发送多个打开主界面、选中、切页或投屏链接时，以最后一次主状态操作为准。
- 同一无线端点的并发连接请求会合并，避免重复连接。
- 待处理队列最多保存 32 项；超过上限时会丢弃最早的一项。
- 应用退出期间收到的链接不会重新创建窗口。

## 安全限制

URL Scheme 来自浏览器或第三方系统时会按不可信输入处理。

- 整条 URL 最长 2048 个字符。
- 设备 ID 最长 255 个字符。
- 拒绝未知操作、未知参数和重复参数。
- 拒绝无效 IPv4、无效端口、账号密码、URL 片段、路径穿越、路径中的连续斜杠、错误百分号编码、控制字符和双向文本控制字符。
- 不允许通过 URL Scheme 直接执行任意 Shell 命令。
- 不允许通过 URL Scheme 删除文件、安装 APK、执行按键或电源操作。
- 不允许通过 URL Scheme 强制实时截图；截图链接只打开缓存页。

## 常见问题

### 点击链接没有反应

1. 确认安装的 AYA-Plus 版本不低于 `1.14.8`。
2. 先正常启动一次安装版，再重新点击链接。
3. 检查电脑是否同时安装了多个 AYA 或 AYA-Plus 副本。
4. 多个副本同时存在时，通常由最后注册 `aya://` 的应用接收链接。
5. 开发模式也可能临时改变协议归属。Windows 请重新运行 NSIS 安装器或执行修复安装以恢复正式注册；macOS、Linux 请重新启动或重新集成正式安装版。

### 设备被导入但显示离线

这表示设备记录已经保存，但 ADB 连接没有成功。请检查：

- 设备与电脑网络是否互通。
- 设备的无线 ADB 是否已开启。
- IP 和端口是否正确。
- 防火墙是否拦截连接。

修复网络后，可以在设备管理器中点击“重新连接并刷新所有设备”，也可以再次打开同一条链接。

### 链接提示参数无效

- 删除文档中未列出的参数。
- 检查是否同时提供了同义参数。
- 检查端口是否在 `1-65535` 范围内。
- 对中文、空格和 `IP:端口` 中的冒号进行 URL 编码。
- 不要在 IP、端口或设备 ID 前后添加空格。

### 截图页不是最新画面

这是预期行为。`aya://main/screenshot` 只打开本地缓存截图，不会触发实时抓图。请在 AYA-Plus 中手动点击更新截图。
