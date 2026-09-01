# skillone

[English](README.md) | [简体中文](README.zh-CN.md)

一个用于查找、安装和管理 agent skills 的桌面应用。基于 Tauri v2 构建，前端使用 React + shadcn/ui，后端由 Rust（`agents-skills` 库）提供技能安装与 agent 链接能力。

> 由 **skill-one** 组织维护：<https://github.com/skill-one>

## 功能

- **商店 / 探索**：浏览 skills 注册表，查看每个 skill 的说明（`SKILL.md`）并一键安装。
- **我的 Skills**：查看、更新与卸载已安装的技能。
- **Agent 链接**：将各类 agent（Claude Code、Cursor、Gemini CLI 等）的技能目录链接到统一目录，支持迁移已有技能。
- **应用内自更新**：启动时自动检查新版本，一键下载安装签名更新包——无需重新手动下载，也无需 Apple 开发者账号（更新包以 minisign 密钥验签）。
- **设置**：可配置注册表文件的下载源（直连 GitHub 或 CDN 镜像）。

## 安装

### 从 Releases 下载（推荐）

到 [Releases](https://github.com/skill-one/skillone/releases) 页面下载最新的 `.dmg`（目前提供 macOS Apple Silicon 版），然后：

1. 打开 `.dmg`，把 **skillone** 拖入「应用程序」文件夹。
2. 启动应用——首次启动只需按 [macOS 首次安装须知](#macos-首次安装须知) 放行一次 Gatekeeper。

自 v0.2.0 起不必再手动下载：新版本会通过内置更新器自动送达。（更早版本的安装包里没有更新器，因此需要这一次手动重装。）

### Homebrew（一条命令）

```bash
brew install --cask skill-one/tap/skillone
```

brew 用户可以一直用 `brew upgrade --cask skillone` 升级；brew 下载不带 quarantine 属性，完全不会触发 Gatekeeper 提示。

## 保持最新

skillone 通过 GitHub Releases + **应用内更新器** 发布更新：

- 启动时静默检查最新版本；发现新版会弹出更新窗，点「立即更新」即带进度下载安装，完成后自动重启进入新版本。
- 也可以随时手动检查：**设置 → 软件更新 → 检查更新**。
- 每个更新包在安装前都会做密码学**签名校验**，签名不符的包永远不会被安装。（发布只需打一个 `v*` tag——CI 会自动构建、签名并发布更新清单。）

应用内完成的更新不会被 Gatekeeper 拦截（替换由应用自身执行）。通过 Homebrew 安装的用户，建议继续用 `brew upgrade --cask skillone` 升级，以保持 brew 的记录同步。

### macOS 首次安装须知

本应用以 ad-hoc 签名分发（未购买 Apple 开发者 ID），因此**手动下载首次安装**时，macOS 可能提示「无法打开 skillone，因为无法验证开发者」（macOS 15 起，右键打开也可能提示「无法打开」）。任选一种方式一次性放行：

- **右键（或按住 Control 点击）应用 → 打开 →** 弹窗中再点**打开**；或
- **系统设置 → 隐私与安全性** → 拉到底部被拦截提示处 → 点**仍要打开**。

也可用命令行的方式去掉隔离属性：`xattr -d com.apple.quarantine /Applications/skillone.app`。

放行这一次之后，应用永久正常打开——后续由应用内更新器送达的更新也**不会再要求放行**。（Homebrew 安装则完全没有这一步。）

## 使用

启动应用后，通过左侧导航在以下页面间切换：

1. **商店 / 探索**：浏览并安装 skills。
2. **我的 Skills**：更新或卸载已安装技能。
3. **Agent 链接**：管理各 agent 的技能目录链接与迁移。
4. **设置**：切换注册表下载源（直连 GitHub 或 CDN 镜像），以及检查应用更新。

## 开发

面向开发者的构建、架构与测试说明见 [docs/development.zh-CN.md](docs/development.zh-CN.md)。更新器链路见 [docs/auto-update.zh-CN.md](docs/auto-update.zh-CN.md)。
