# 开发说明

[English](development.md) | [简体中文](development.zh-CN.md)

面向开发者的构建、技术栈、架构、测试与发布说明。使用者说明见 [README](../README.md)。

## 技术栈

| 层         | 技术                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| 桌面运行时 | [Tauri v2](https://v2.tauri.app/) + Rust                                                        |
| UI         | [React 19](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/)（Radix UI + Tailwind CSS） |
| 路由       | [react-router v8](https://reactrouter.com/)（HashRouter）                                       |
| 数据请求   | [TanStack Query v5](https://tanstack.com/query)（持久化到 localStorage）                        |
| 构建       | [Vite 8](https://vite.dev/) + TypeScript 7.0                                                    |
| 测试       | [Vitest 4](https://vitest.dev/) + Testing Library                                               |

## 环境要求

- **Node.js**（≥ 24，当前的 Active LTS，见 `.nvmrc`）与 [pnpm](https://pnpm.io/)（版本由 `package.json` 的 `packageManager` 字段锁定）
  - 这个下限不是随意定的：Vite 8 要求 Node 20.19+/22.12+，而 react-router v8 要求 Node 22.22+，且只支持维护期 LTS 线的「最新小版本」。Node 24 是 Active LTS，因此 CI 与本地开发都统一以它为目标。`package.json` 用 `engines.node` 声明该约束（默认只是警告，不会强制拦截；若要强制，请在 `.npmrc` 中加 `engine-strict=true`）。
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
| `pnpm dev:test`                                 | 在 5273 端口启动第二个桌面开发实例，测试/开发时不占用主端口 5173 |
| `pnpm build`                                    | 类型检查 + 前端构建               |
| `pnpm typecheck`                                | 仅运行 TypeScript 类型检查        |
| `pnpm preview`                                  | 预览构建产物                      |
| `pnpm tauri dev`                                | 启动桌面应用（开发模式）          |
| `pnpm tauri build`                              | 打包桌面应用                      |
| `pnpm test` / `test:run` / `test:coverage`      | 运行 / 单次运行 / 覆盖率测试      |
| `pnpm lint` / `lint:fix`                        | 代码检查（仅语法规则）/ 带自动修复 |
| `pnpm lint:types`                               | 代码检查（含类型感知规则，需要类型图，更慢） |

## 项目结构

```
skill-one/
├── src/                    # 前端（React + TypeScript）
│   ├── components/         # 跨页面共享组件
│   │   ├── ui/             # shadcn/ui 组件
│   │   ├── app-sidebar.tsx # 侧边栏导航（路由 + 标题栏共用）
│   │   ├── agent-icon.tsx  # agent 品牌图标
│   │   ├── owner-avatar.tsx# 仓库头像
│   │   ├── skill-detail/    # 共享的 skill 详情面板与模态抽屉
│   │   └── placeholder.tsx # 各列表页共用的「无内容」空态
│   ├── pages/              # 页面级组件，按页聚合（含私有子组件与测试）
│   │   ├── explore/        # 商店探索相关页面（skill-list-row / skill-install-button）
│   │   │   └── featured/   # 精选页（hero 榜单轮播 + 分类区块）
│   │   ├── my-skills/      # 我的 Skills 页（agent-icon-grid / agent-icon-button / link-confirm-dialog 等）
│   │   └── settings/       # 设置页
│   ├── hooks/              # 自定义 hooks
│   ├── lib/                # API / 业务逻辑层
│   ├── types/              # 类型定义
│   ├── data/               # 静态数据（测试 mock 索引 + 精选页策划分类）
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

详细说明见 [`architecture.zh-CN.md`](architecture.zh-CN.md)；后端用到的 `agents-skills` 接口见 [`agents-skills-api.zh-CN.md`](agents-skills-api.zh-CN.md)；商店注册表索引的格式与用法见 [`index-format.zh-CN.md`](index-format.zh-CN.md)。

## 主题

应用支持浅色、深色与跟随系统三种外观，可在「设置 → 外观」卡片中切换。

shadcn/ui 原生自带深色调色板：`src/index.css` 同时定义了 `:root` 与 `.dark` 两套 oklch 变量，并声明了 `@custom-variant dark (&:is(.dark *))`，`src/components/ui/` 下的组件全部读取语义化 token。因此支持暗黑模式只需在 `<html>` 上切换 `dark` 类，这正是 [next-themes](https://github.com/pacocoursey/next-themes) 所做的事：

- `src/components/theme-provider.tsx` —— 唯一的共享配置（`attribute="class"`、`defaultTheme="system"`、`enableColorScheme`、`storageKey="skill-one-theme"`），并负责把主题同步到原生窗口。
- `src/components/theme-mode-toggle.tsx` —— 设置页上的三选 `ToggleGroup` 分段控件。
- `src/hooks/use-native-theme.ts` —— 在 Tauri 环境中调用 `getCurrentWindow().setTheme()`，让系统绘制的部分（标题栏、滚动条、表单控件、菜单栏 popover 的玻璃材质）一并跟随；`system` 映射为 `null`，交由操作系统自行决定。macOS 上 `set_theme` 是全应用生效的，主窗口这一次调用会覆盖所有窗口。

只有主窗口入口 `src/main.tsx` 需要挂载 Provider。菜单栏 popover（`src/popover/popover-main.tsx`）刻意不挂主题 Provider：`src/popover/popover.css` 只为该文档把 shadcn token 重新定义为一套半透明的系统色值（label / secondary label / 半透明填充 / hairline 分隔线），并由 `prefers-color-scheme` 驱动切换——它与透明窗口背后原生玻璃材质读取的是同一个外观源，因此内容与毛玻璃背景永远不会一深一浅。

新增 UI 样式时的约定：

- 使用语义化 token（`bg-background`、`text-muted-foreground`、`border-border`），不要直接写调色板颜色，这样切换主题无需改动组件。
- 只有当颜色位于品牌渐变或图片之上、两种主题下观感一致时，才可以使用固定色（例如精选页 hero）。
- 确实无法避免时（如 `text-emerald-600` 这类状态文案），必须同时补上 `dark:` 变体。

## 测试

分两层，每层补齐另一层覆盖不到的部分：

| 层 | 工具 | 命令 | 覆盖范围 |
| --- | --- | --- | --- |
| 单元 / 组件 | Vitest + Testing Library（jsdom） | `pnpm test` / `test:run` | 纯逻辑与组件的隔离行为 |
| 覆盖率门禁 | Vitest（`@vitest/coverage-v8`） | `pnpm test:coverage` | 校验 `vite.config.ts` 中的阈值 |

组件测试与 `src/lib` 下的单元测试均遵循「一个文件对应一个 `*.test.ts(x)`」的约定，可通过 `pnpm test:run` 一键运行。

## 内容安全策略（CSP）

`src-tauri/tauri.conf.json` 中配置了 `app.security.csp`。不配置时应用完全没有任何策略；配置后 WebView 会拒绝指令不允许的一切。构建时 Tauri 会为打包代码追加 nonce 与 hash。

| 指令 | 值 | 原因 |
| --- | --- | --- |
| `default-src` | `'self'` | 未在下面列出的资源都来自打包产物。 |
| `script-src` | `'self'` | 不允许 inline 与 `eval` —— Tauri 会对打包脚本做 nonce 匹配。 |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind 产出独立样式表，但 React 会写内联 `style` 属性。 |
| `img-src` | `'self' https: data: blob:` | 仓库头像与 `SKILL.md` 里的图片天然是远程的。 |
| `font-src` | `'self' data:` | 内联的字体子集。 |
| `worker-src` | `'self' blob:` | registry worker 是打包出的 ES module；`blob:` 兼容被内联的情况。 |
| `connect-src` | `'self' ipc: http://ipc.localhost https: http://localhost:* http://127.0.0.1:*` | `ipc:` 是 Tauri 的命令通道；`https:` 用于 registry、`SKILL.md` 与头像；环回地址允许自建镜像走明文 HTTP。 |

修改时有两点要留意：

- **`connect-src` 里的 `https:` 是刻意且宽泛的。** 下载源在「设置」里由用户自定义，构建时无法预知主机名。非环回地址的明文 HTTP 自定义 CDN 会被拦截 —— 要收紧这里，必须同时给该输入框加上校验。
- **CSP 只存在于打包后的应用中。** 开发时（`pnpm dev`）页面由 Vite 提供，不带任何策略。目前没有自动附加 CSP 的测试，修改 CSP 后请在 `pnpm tauri build` 的产物上手动验证。

渲染远程 `SKILL.md` 内容与 CSP 是两件事：`react-markdown` 没有启用 `rehype-raw`，源码里的裸 HTML 不会被渲染，链接与图片 URL 也会经过 scheme 白名单解析（`src/components/markdown.tsx`）。CSP 是兜底，不是主要防线。

## 隔离 worktree

新任务在 `.worktrees/` 下的 `git worktree` 里进行，以保证 `main` 的检出照常可用；worktree 里的 dev server 不能占用 5173（那是 `main` 的端口，且启用 `strictPort`），请用 5273 的 `pnpm dev:test`。

两个设置细节能省下真实的时间：

- **依赖要真装。** 软链主检出的 `node_modules` 会让 `pnpm build` 失败：pnpm 会先跑一遍安装预检，而软链目录满足不了它。在 worktree 里正常执行 `pnpm install`，`pnpm build`、`pnpm typecheck` 与 CI 的行为才会完全一致。
- **共用 Rust 构建缓存。** `src-tauri/target` 有几十 GB，别让每个 worktree 从头编译一遍：用 `CARGO_TARGET_DIR=<repo>/src-tauri/target cargo check` 指回主检出。注意：设了这个变量就**不要**执行 `cargo clean`，它会连主检出的缓存一起删掉；要先取消该变量，或只对 worktree 自己的 target 做清理。

## 发布

发版就是推一个附注 tag——完整流程与产物说明见 [auto-update.zh-CN.md](auto-update.zh-CN.md)。简要：

1. **更新版本号**：必须保持一致的位置见 [auto-update.zh-CN.md](auto-update.zh-CN.md) 第 1 步，那份文档同时给出提交命令。
2. **提交并打 tag**：`chore(release): bump version to X.Y.Z`，随后 `git tag -a vX.Y.Z -m "vX.Y.Z"`。
3. **推送**：先 `git push origin main`，再推 tag——推送 `v*` tag 正是触发构建的动作。

[GitHub Actions](../.github/workflows/release.yml) 会在 `macos-14`（arm64）上构建，并上传 `.dmg`、经 minisign 签名的 `Skill One.app.tar.gz` 与应用内更新器读取的 `latest.json` 清单，同时按 SHA256 更新 [skill-one/homebrew-tap](https://github.com/skill-one/homebrew-tap) 里的 `skill-one.rb` cask。

> 应用为 ad-hoc 签名分发，手动下载的 macOS 版本首次启动需在「系统设置 → 隐私与安全性」中允许打开。自 v0.2.0 起，已安装的应用可在应用内自行完成更新。
