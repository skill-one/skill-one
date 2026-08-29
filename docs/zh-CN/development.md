# 开发说明

[English](../development.md) | [简体中文](development.md)

面向开发者的构建、技术栈、架构、测试与发布说明。使用者说明见 [README](../../README.md)。

## 技术栈

| 层         | 技术                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| 桌面运行时 | [Tauri v2](https://v2.tauri.app/) + Rust                                                        |
| UI         | [React 19](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/)（Radix UI + Tailwind CSS） |
| 路由       | [react-router-dom v7](https://reactrouter.com/)（HashRouter）                                   |
| 数据请求   | [TanStack Query v5](https://tanstack.com/query)（持久化到 localStorage）                        |
| 构建       | [Vite 5](https://vitejs.dev/) + TypeScript 5.7                                                  |
| 测试       | [Vitest 2](https://vitest.dev/) + Testing Library                                               |

## 环境要求

- **Node.js**（≥ 18）与 [pnpm](https://pnpm.io/)（版本由 `package.json` 的 `packageManager` 字段锁定）
- **Rust** 工具链，`rustc >= 1.88`
- **Tauri 系统依赖**：参见 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)

## 快速开始

```bash
pnpm install         # 安装依赖
pnpm dev             # 仅启动前端（浏览器模式，内存 mock 数据）
pnpm tauri dev       # 启动桌面应用（Tauri 开发模式）
pnpm test:run        # 单次运行测试
pnpm tauri build     # 构建发布包
```

## 常用脚本

| 命令                                            | 说明                              |
| ----------------------------------------------- | --------------------------------- |
| `pnpm dev`                                      | 启动 Vite 开发服务器（端口 5173） |
| `pnpm build`                                    | 类型检查 + 前端构建               |
| `pnpm typecheck`                                | 仅运行 TypeScript 类型检查        |
| `pnpm preview`                                  | 预览构建产物                      |
| `pnpm tauri dev`                                | 启动桌面应用（开发模式）          |
| `pnpm tauri build`                              | 打包桌面应用                      |
| `pnpm test` / `test:run` / `test:coverage`      | 运行 / 单次运行 / 覆盖率测试      |

## 项目结构

```
skillone/
├── src/                    # 前端（React + TypeScript）
│   ├── components/         # 跨页面共享组件
│   │   ├── ui/             # shadcn/ui 组件
│   │   ├── app-sidebar.tsx # 侧边栏导航（路由 + 标题栏共用）
│   │   ├── agent-icon.tsx  # agent 品牌图标
│   │   ├── owner-avatar.tsx# 仓库头像
│   │   └── placeholder-page.tsx # 未实现页面的占位
│   ├── pages/              # 页面级组件，按页聚合（含私有子组件与测试）
│   │   ├── explore/        # 商店探索页（skill-card / skill-detail-panel）
│   │   ├── my-skills/      # 我的 Skills 页（agent-icon-grid / agent-icon-button / stray-files-dialog 等）
│   │   └── settings/       # 设置页
│   ├── hooks/              # 自定义 hooks
│   ├── lib/                # API / 业务逻辑层
│   ├── types/              # 类型定义
│   ├── data/               # mock 数据
│   ├── test/               # 测试工具与 setup
│   ├── App.tsx             # 路由与布局
│   └── main.tsx            # 入口
├── src-tauri/              # 后端（Rust + Tauri）
│   ├── src/                # Tauri 命令（install/list/remove/link 等）
│   ├── capabilities/       # 权限声明
│   └── tauri.conf.json     # Tauri 配置
├── components.json         # shadcn/ui 配置
└── vite.config.ts          # Vite + Vitest 配置
```

## 架构

应用采用「前端负责读取、后端负责写入」的分层：

- **读取**：skills 注册表索引与单个 skill 的 `SKILL.md` 由前端通过可配置的下载源（直连 GitHub 或 CDN 镜像）直接拉取，并缓存到 TanStack Query。
- **写入**：技能的安装、更新、卸载，以及 agent 目录的链接/迁移，均通过 Tauri 命令委托给 Rust 侧的 `agents-skills` 库。
- **浏览器兜底**：在纯浏览器环境（开发服务器 / 测试）下，写入操作回退到内存 mock，保证 UI 可完整体验。

详细说明见 [`architecture.md`](architecture.md)；后端用到的 `agents-skills` 接口见 [`agents-skills-api.md`](agents-skills-api.md)；商店注册表索引的格式与用法见 [`index-format.md`](index-format.md)。

## 测试

测试使用 Vitest + Testing Library，运行在 `jsdom` 环境。组件测试与 `src/lib` 下的单元测试均遵循「一个文件对应一个 `*.test.ts(x)`」的约定，可通过 `pnpm test:run` 一键运行。

## 发布

发布流程由 [GitHub Actions](../../.github/workflows/release.yml) 自动完成，步骤如下：

1. **更新版本号**：修改 `package.json` 中的 `version`，并同步 `src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml` 的 `version`（三处必须一致，`Cargo.lock` 会随构建自动更新）。
2. **打 tag 并推送**：tag 形如 `v<version>`（例如 `v0.1.1`）。
3. 推送 `v*` tag 或手动触发 workflow 后，CI 自动执行：
   - 在 `macos-14`（arm64）上执行 `pnpm tauri build` 产出 `.dmg`。
   - 创建 GitHub Release 并上传 `.dmg`。
   - 计算 SHA256 后，更新 [skill-one/homebrew-tap](https://github.com/skill-one/homebrew-tap) 仓库中的 `skillone.rb` cask 并推送，用户即可通过 Homebrew 升级。

```bash
# 本地完成版本号修改后
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to 0.1.1"
git tag v0.1.1
git push origin main --tags
```

> 应用未签名，macOS 首次启动需在「系统设置 → 隐私与安全性」中允许打开。
