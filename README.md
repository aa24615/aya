<div align="center">
  <a href="https://cnb.cool/scrmoa/other/aya/-/releases" target="_blank">
    <img src="build/icon.png" width="400">
  </a>
</div>

<h1 align="center">AYA-Plus</h1>

<div align="center">

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

<div align="center">

AYA-Plus Android ADB desktop app.

[![Windows][windows-image]][release-url]
[![macOS][mac-image]][release-url]
[![Linux][linux-image]][release-url]
![License][license-image]

</div>

[windows-image]: https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=windows
[mac-image]: https://img.shields.io/badge/-macOS-black?style=flat-square&logo=apple
[linux-image]: https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux
[release-url]: https://cnb.cool/scrmoa/other/aya/-/releases
[license-image]: https://img.shields.io/github/license/aa24615/aya?style=flat-square

<img src="https://aya.liriliri.io/screencast.png" style="width:100%">

[AYA-Plus](https://github.com/aa24615/aya) is an enhanced fork of [AYA](https://aya.liriliri.io/) for managing and controlling Android devices through a visual ADB interface.

## Installation

Open the [AYA-Plus Releases](https://cnb.cool/scrmoa/other/aya/-/releases) page to download an installer. Windows x64, Mac arm64, Mac x64 and Linux x86_64 are supported.

## Features

<img src="https://aya.liriliri.io/screenshot.png" style="width:100%">

* Screen mirror
* File explorer
* Application manager
* Process monitor
* Layout inspector
* CPU, memory and FPS monitor
* Logcat viewer
* Interactive shell
* Custom device name and remark
* Device list import and export in CSV format
* Device table/card views with batch screenshot refresh

## Main Device List

The main window uses fixed-height device cards in the left sidebar. Use the
search box to filter connected devices by device name or IP address. Searching
only changes the visible list and does not switch or disconnect the active
device. Each card shows the custom device name, falling back to the ADB model
when no custom name is set, followed by the ADB device ID. Network devices use
an `IP:port` ID; USB and emulator devices keep their original ADB ID. The model
is not repeated when a custom name exists, and remarks are not shown here.

## Device Cards and Batch Screenshots

Card mode uses a five-column vertical gallery. Each screenshot is shown above
the text at its original aspect ratio, so the image height adapts without
cropping the screen. The name and device ID use a separate fixed-height area
below the image, so the total card height is the image height plus the text
area and cards never overlap. Each five-card row starts below its tallest card.
A compact green or gray tag in the image corner indicates whether the device
is online or offline. The text below only shows the custom device name (or the
ADB model when no custom name is set) and the device ID.
Network devices use an `IP:port` ID, while USB and emulator devices keep their
original ADB ID. Selecting a card shows the full screenshot in the resizable
pane on the right.

The **Reconnect and Refresh All Devices** button reconnects every saved network
device, deduped by `IP:port`, and then reloads the latest status of network,
USB, and emulator devices. One failed network connection does not stop the
remaining devices. When saved network devices exist, AYA-Plus reports their
online and offline counts after the refresh finishes. Refreshing device status
does not capture screenshots.

AYA-Plus persistently caches the last successful screenshot for every device
and restores it after the app restarts. Wireless ADB screenshots are named by
IP, such as `10.0.0.8.png`; a changed port still overwrites the same file. USB
and emulator devices use a filename-safe encoded device ID. Only one PNG is
kept for each device, and a failed capture never replaces the previous cache.
Offline cached thumbnails and full previews are shown in grayscale and return
to color automatically when the device comes online again.

Opening the screenshot page, selecting a card, or switching devices only reads
the local cache and does not capture a new image. Use the recapture button in
the main screenshot page or device manager for one device, or use the batch
button for all online devices. While the app is running, it attempts one
background refresh round per minute with at most three captures running at the
same time; a round is skipped if the previous round is still running.

Cached PNG files are stored under `data/screenshots` in the AYA-compatible user
data directory. Screenshots may contain sensitive information; quit the app
before deleting this directory if the cache needs to be cleared.

The device-manager search works in both card and table views. It supports
device names, models, IP/device IDs, serial numbers, remarks, Android versions,
and online status. Multiple keywords may be combined, for example a device
name plus part of its IP address.

## Device Metadata and CSV

The device manager keeps the ADB-reported model and adds two editable fields: **Device Name** and **Remark**. Select a device and click **Edit** to update these fields. Wireless-device metadata is stored per IP address and port, while USB and emulator metadata uses the serial number when available. Existing serial-based metadata remains readable for compatibility.

Use **Export CSV** to create a complete backup of the current device list. For batch network-device import, use these four columns:

```text
Device Name,IP Address,Port,Remark
Front Desk,192.168.1.10,5555,First-floor lobby
```

AYA-Plus combines the IP address and port, attempts `adb connect`, and then reads the model, serial number, Android version, and SDK version from every connected device. Failed connections remain available as offline remote devices with their imported name and remark. Devices must already have ADB TCP enabled or be paired for wireless debugging; the CSV port is the connection port, not the pairing port.

The complete export format uses stable Chinese headers and keeps the four
network-management fields first:

```text
设备名称,IP地址,端口,备注,ID,序列号,型号,Android版本,SDK版本,状态
```

Wireless devices export the IP address and port into separate columns; USB and
emulator rows leave those columns empty and retain their original ADB ID. The
same IP address and numeric port form one unique device. Re-importing that
endpoint updates its device name and remark instead of adding another row, and
the last duplicate CSV row wins. Legacy eight-column exports remain supported.

CSV files with English or Chinese headers, UTF-8 BOM, quoted commas, and multiline remarks are supported. IPv4 addresses and ports from 1 to 65535 are accepted. See the [Chinese documentation](README.zh-CN.md#设备名称备注与-csv-管理) for detailed instructions.

## URL Scheme

Installed builds register the `aya://` URL Scheme. Links can open AYA-Plus,
add one wireless device, switch the active device, start screencasting, open
the device manager, or select a main-window panel:

```text
aya://list/add?ip=192.168.2.15&port=5555&name=Classroom%20Display&remark=First%20floor
aya://device/select?ip=192.168.2.15&port=5555
aya://screencast?ip=192.168.2.15&port=5555
aya://main/screenshot?ip=192.168.2.15&port=5555
aya://devices
```

`port` defaults to `5555`. A combined ADB ID can be supplied instead, for
example `device=192.168.2.15%3A5555` or `device=emulator-5554`. Wireless
devices are uniquely identified by their canonical `IP:port`. If an endpoint
does not exist yet, AYA-Plus saves it first and then attempts to connect before
performing the requested action. Existing endpoints are reused; `name` (or
`deviceName`) and `remark` only overwrite metadata when explicitly supplied.

The allowed main panels are `overview`, `file`, `application`, `process`,
`performance`, `shell`, `layout`, `screenshot`, `logcat`, and `webview`.
Short aliases such as `aya://select`, `aya://cast`, `aya://screenshot`,
`aya://list/add`, and `aya://投屏` are also accepted. A screenshot link only
opens the cached screenshot page; it does not capture a fresh image.

Links are treated as untrusted input. Unknown actions or parameters, invalid
IPv4 addresses/ports, credentials, fragments, control characters, and
oversized values are rejected. The URL Scheme never directly executes a shell
command, deletes files, installs APKs, or triggers a real-time screenshot.
On macOS, test an installed build with
`open 'aya://device/select?ip=192.168.2.15&port=5555'`. If multiple AYA/AYA-Plus
copies are installed, the last application registered for `aya://` normally
owns the protocol.

For more detailed usage instructions, refer to the [upstream AYA documentation](https://aya.liriliri.io).

## Related Projects

* [licia](https://github.com/liriliri/licia): Utility library used by AYA-Plus.
* [luna](https://github.com/liriliri/luna): UI components used by AYA-Plus.
* [vivy](https://github.com/liriliri/vivy): Icon image generation.
* [echo](https://github.com/liriliri/echo): Harmony OS device-management project.

## Contribution

Read the upstream [Contributing Guide](https://aya.liriliri.io/guide/contributing.html) for development setup instructions.

## Brand Assets

AYA-Plus keeps the original application ID, Android helper protocol, and `AYA` user-data directory so existing installations retain their device names, remarks, remote devices, and settings. The **Check for Updates** menu opens this project's Releases page instead of the upstream AYA feed. On macOS, run `npm run gen:app-icon` to regenerate all committed Plus icon assets from the preserved source artwork.
