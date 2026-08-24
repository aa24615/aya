<div align="center">
  <a href="https://aya.liriliri.io/" target="_blank">
    <img src="https://aya.liriliri.io/icon.png" width="400">
  </a>
</div>

<h1 align="center">AYA</h1>

<div align="center">

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

<div align="center">

Android ADB desktop app.

<a href="https://www.producthunt.com/posts/aya-1?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-aya&#0045;1" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=899538&theme=light&t=1740125747753" alt="AYA - Open&#0032;source&#0032;desktop&#0032;app&#0032;for&#0032;controlling&#0032;android&#0032;devices | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>

[![Windows][windows-image]][release-url]
[![macOS][mac-image]][release-url]
[![Linux][linux-image]][release-url]
[![Downloads][download-image]][release-url]
![License][license-image]

</div>

[windows-image]: https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=windows
[mac-image]: https://img.shields.io/badge/-macOS-black?style=flat-square&logo=apple
[linux-image]: https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux
[download-image]: https://img.shields.io/github/downloads/liriliri/aya/total?style=flat-square
[release-url]: https://github.com/liriliri/aya/releases
[license-image]: https://img.shields.io/github/license/liriliri/aya?style=flat-square

<img src="https://aya.liriliri.io/screencast.png" style="width:100%">

[AYA](https://aya.liriliri.io/) is a desktop application for easily controlling android devices, which can be considered as a GUI wrapper for ADB.

## Installation

Click [here](https://github.com/liriliri/aya/releases/) to download and install AYA. Windows x64, Mac arm64, Mac x64 and Linux x86_64 are supported.

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

## Device Metadata and CSV

The device manager keeps the ADB-reported model and adds two editable fields: **Device Name** and **Remark**. Select a device and click **Edit** to update these fields. Metadata is stored locally and is associated with the device serial number when available.

Use **Export CSV** to back up the current device list or create an import template. Use **Import CSV** to restore metadata and add remote ADB devices. The `ID` column is required. Exported files contain the following columns:

```text
ID,Serialno,Model,Device Name,Remark,Android Version,SDK Version,Status
```

For an offline remote device, use an ADB endpoint such as `192.168.1.10:5555` as its ID. CSV files with English or Chinese headers, UTF-8 BOM, quoted commas, and multiline remarks are supported. See the [Chinese documentation](README.zh-CN.md#设备名称备注与-csv-管理) for detailed instructions.

For more detailed usage instructions, please read the documentation at [aya.liriliri.io](https://aya.liriliri.io)!

## Related Projects

* [licia](https://github.com/liriliri/licia): Utility library used by AYA.
* [luna](https://github.com/liriliri/luna): UI components used by AYA.
* [vivy](https://github.com/liriliri/vivy): Icon image generation.
* [echo](https://github.com/liriliri/echo): Harmony OS version of AYA.

## Contribution

Read [Contributing Guide](https://aya.liriliri.io/guide/contributing.html) for development setup instructions.
