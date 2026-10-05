# Skill One

[English](README.md) | [简体中文](README.zh-CN.md)

一个用于查找、安装和管理 agent skills 的桌面应用。基于 Tauri v2 构建，前端使用 React + shadcn/ui，后端由 Rust（`agents-skills` 库）提供技能安装与 agent 链接能力。

> 由 **skill-one** 组织维护：<https://github.com/skill-one>

## 功能

- **商店 / 探索**：浏览 skills 注册表，查看每个 skill 的说明（`SKILL.md`）并一键安装。
- **我的 Skills**：查看、更新与卸载已安装的技能。
- **Agent 链接**：将各类 agent（Claude Code、Cursor、Gemini CLI 等）的技能目录链接到统一目录，支持迁移已有技能。
- **应用内自更新**：启动时、切回前台及每小时兜底检查新版本，一键下载安装签名更新包——无需重新手动下载，也无需 Apple 开发者账号（更新包以 minisign 密钥验签）。
- **设置**：可配置注册表文件的下载源（直连 GitHub 或 CDN 镜像）。

## 安装

到 [Releases](https://github.com/skill-one/skill-one/releases) 页面下载最新的 `.dmg`（目前提供 macOS Apple Silicon 版），然后：

1. 打开 `.dmg`，把 **Skill One** 拖入「应用程序」文件夹。
2. 启动应用——首次启动只需按 [macOS 首次安装须知](#macos-首次安装须知) 放行一次 Gatekeeper。

## 保持最新

启动时、切回前台时以及每小时兜底自动检查更新；发现新版会提示，点「立即更新」即下载安装并自动重启；也可手动检查：**设置浮窗 → 软件更新**。更新包安装前会做签名校验，签名不符不会安装。

## macOS 首次安装须知

应用为 ad-hoc 签名，手动下载的 `.dmg` 首次启动可能被 Gatekeeper 拦截。任选一种方式放行一次：

- 右键（或 Control + 点击）应用 → **打开** → 在弹窗里再点**打开**；
- **系统设置 → 隐私与安全性** → 点被拦截提示处的**仍要打开**；
- 终端执行 `xattr -d com.apple.quarantine "/Applications/Skill One.app"`。

放行后永久正常打开，后续应用内更新不会再提示。

## 使用

启动应用后，通过窗口顶栏的「商店 / 我的」切换在以下页面间移动：

1. **商店 / 探索**：浏览并安装 skills。
2. **我的 Skills**：更新或卸载已安装技能。
3. **Agent 链接**：管理各 agent 的技能目录链接与迁移。
4. **设置**：切换注册表下载源（直连 GitHub 或 CDN 镜像），以及检查应用更新。
5. **活动日志**：查看应用对技能与 Agent 做过的操作——安装、卸载、启停、关联 Agent、来源关联。

## 开发

面向开发者的构建、架构与测试说明见 [docs/development.zh-CN.md](docs/development.zh-CN.md)。测试分层见 [docs/testing.zh-CN.md](docs/testing.zh-CN.md)。更新器链路见 [docs/auto-update.zh-CN.md](docs/auto-update.zh-CN.md)。活动日志见 [docs/activity-log.zh-CN.md](docs/activity-log.zh-CN.md)。
