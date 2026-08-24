# AYA CNB 构建发版

在 CNB 仓库的分支详情页点击 **构建新版本**，选择版本更新类型后，流水线会自动完成版本计算、质量检查、打包和 Release 发布。

## 版本规则

- `major`：`1.0.0` → `2.0.0`
- `minor`：`1.0.0` → `1.1.0`
- `patch`：`1.0.0` → `1.0.1`

流水线会比较 `package.json` 与已有稳定 `vX.Y.Z` Tag，从较新的版本继续递增。首次执行时，当前项目会从 `1.14.2` 继续计算，例如选择 `patch` 会发布 `v1.14.3`。

## 发布门禁与产物

正式打包前必须依次通过：

1. 安装项目依赖。
2. TypeScript 类型检查：`npx tsc --noEmit`。
3. ESLint：`npm run lint`。
4. Android 端 AYA 服务构建。

通过后生成并发布：

- Linux x64：`AYA-{version}-linux-x86_64.AppImage`
- Windows x64：`AYA-{version}-win-x64.exe`
- `SHA256SUMS.txt`

产物既会保留为流水线构建产物，也会挂载到自动创建的 CNB Release。

## 平台说明

CNB SaaS 默认使用 Linux Docker 构建节点，因此本流水线原生构建 Linux AppImage，并通过 Electron Builder 官方 Wine 镜像交叉构建 Windows NSIS 安装包。macOS DMG 不能在 Linux 节点完成签名与打包，继续由现有 GitHub Actions 的 macOS Runner 构建。

当前 CNB 仓库未配置 Windows 代码签名证书，因此生成的 NSIS 安装包为未签名版本，Windows 可能显示 SmartScreen 提示。后续如在 CNB 密钥库配置 `CSC_LINK` 与 `CSC_KEY_PASSWORD`，Electron Builder 可使用显式证书进行签名。
