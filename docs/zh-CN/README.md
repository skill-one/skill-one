# skillone

[English](../../README.md) | [简体中文](README.md)

一个用于查找、安装和管理 agent skills 的桌面应用。基于 Tauri v2 构建，前端使用 React + shadcn/ui，后端由 Rust（`agents-skills` 库）提供技能安装与 agent 链接能力。

> 由 **skill-one** 组织维护：<https://github.com/skill-one>

## 功能

- **商店 / 探索**：浏览 skills 注册表，查看每个 skill 的说明（`SKILL.md`）并一键安装。
- **我的 Skills**：查看、更新与卸载已安装的技能。
- **Agent 链接**：将各类 agent（Claude Code、Cursor、Gemini CLI 等）的技能目录链接到统一目录，支持迁移已有技能。
- **设置**：可配置注册表文件的下载源（直连 GitHub 或 CDN 镜像）。

## 安装

### Homebrew（macOS, Apple Silicon）

```bash
brew install --cask skill-one/tap/skillone
```

更新：

```bash
brew update && brew upgrade --cask skillone
```

每次发布新版本（打 `v*` tag）时，GitHub Actions 会自动构建 `.dmg` 并发布 cask 到 [`skill-one/homebrew-tap`](https://github.com/skill-one/homebrew-tap) tap 仓库。

### 手动下载

从 [Releases](https://github.com/skill-one/skillone/releases) 页面下载对应平台的安装包（`.dmg` / `.msi`）。

## 使用

启动应用后，通过左侧导航在以下页面间切换：

1. **商店 / 探索**：浏览并安装 skills。
2. **我的 Skills**：更新或卸载已安装技能。
3. **Agent 链接**：管理各 agent 的技能目录链接与迁移。
4. **设置**：切换注册表下载源（直连 GitHub 或 CDN 镜像）。

## 开发

面向开发者的构建、架构与测试说明见 [development.md](development.md)。
