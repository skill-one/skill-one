# 测试

[English](testing.md) | [简体中文](testing.zh-CN.md)

本项目如何测试，以及每一层为何存在。构建、架构与发布说明见
[development.zh-CN.md](development.zh-CN.md)；面向用户的文档见
[README.zh-CN.md](../README.zh-CN.md)。

## 分层

五层测试，每层覆盖其他层无法覆盖的部分。列出层数不是为了数字，而是为了暴露
空白：某个断言被做了两遍，或者根本没做。

| 层 | 工具 | 命令 | 覆盖内容 |
| --- | --- | --- | --- |
| 单元 / 组件 | [Vitest](https://vitest.dev/) + Testing Library（jsdom） | `pnpm test:run` | 隔离环境下的逻辑与组件 |
| 覆盖率门禁 | Vitest（`@vitest/coverage-v8`） | `pnpm test:coverage` | 强制执行 `vite.config.ts` 中的阈值 |
| 前后端契约 | Vitest | 含在 `pnpm test:run` 中 | Tauri 边界上的命令名、参数键与返回结构 |
| 命令逻辑 | `cargo test`（Rust） | `cd src-tauri && cargo test` | `skills.rs` 的十个命令，跑在沙箱化的 `Manager` 上 |
| 端到端 | [Playwright](https://playwright.dev/) | `pnpm test:e2e` | 浏览器中组装起来的应用：路由、布局、焦点顺序、CSS |
| 可访问性 | axe-core，经 `src/test/a11y.ts` | 含在 `pnpm test:run` 中 | 自定义交互组件上的角色、可访问名与关系 |

每一层都在 CI 中运行。覆盖率门禁用的就是开发者本地跑的同一条
`test:coverage` 命令 —— `vite.config.ts` 里的阈值只有被执行才有意义。

## Tauri 边界，从两侧夹紧

`src/lib/skills-manager.ts` 是前端通往 Rust 的唯一通道，而两侧从不互相校验：
命令名是 `invoke("…")` 调用里的字符串字面量，Rust 侧则是一组
`#[tauri::command]` 函数。在为此新增两侧各一个测试套件之前，没有任何东西跨越
这道缺口。

**调用侧**（`src/lib/skills-manager.test.ts`）把每个导出函数钉在它交给
`invoke` 的确切参数列表上。不只是命令名 —— Tauri 是拿 JS 对象的键去匹配 Rust
函数的参数名，因此不匹配会变成运行时的 "invalid args"，项目里没有任何类型能
发现它。

**返回侧**（`src-tauri/src/skills.rs`）断言每个 DTO 序列化后的键名。这些结构
由手写的 TypeScript interface 逐字段镜像，而
`#[serde(rename_all = "camelCase")]` 是唯一把两种拼写绑在一起的东西；所以
`internal_skills` 漂移成 `internalSkills` 时，UI 只会安静地收到一个
`undefined`。

**中间的逻辑**之所以可测，是因为每个命令都委派给一个
`*_in(&Manager, …)` 函数。`#[tauri::command]` 外壳保持一行委派，而
`run_blocking` 是**故意**不测的：它持有一个 `spawn_blocking` 跳转，并解析真实的
`~/.agents`；测试改为构造一个沙箱化的 `Manager`：

```rust
Manager::builder()
    .home(root)          // 一个 tempfile，绝不是真实 home
    .config(root)
    .cwd(root)
    .probe_system_dirs(false)  // 不探测 /Applications，因此是封闭的
    .build()
```

把三份重复的「名字 → 目录」查找合并成单个 `resolve_skill_dir` 是这次重构的
副产品，而它正是最值得测的那块：对照真实扫描来解析名字、而不是把名字插值进
路径，正是让前端传来的 `../..` 无处可指的原因。

## 端到端测试，以及它刻意不覆盖的部分

`pnpm test:e2e` 跑的是 **web** 构建，端口 5274 —— 不是 5173（那是开发者自己的
dev server），也不是 5273（那属于 Tauri 的 dev-test 配置）。

选 web 构建作为目标，是因为它能证明与不能证明的事情都正好合适。它渲染真实的
外壳、解析真实的路由、挂载真实的 CSS，并使用 `lib/mock-local` 作为 Rust 后端
的替身来作答 —— 这与「这个组件给定这些 props 能否渲染」是不同的断言。Tailwind
类名、hash 路由、焦点顺序与布局只有在这一层才必须凑合到同一个可运行的整体里。

它**不做**的是验证 Tauri 命令。在浏览器里 `isTauri()` 为 false，于是每一次安装、
移除与关联都走替身，Rust 侧根本到不了。那道缺口改由另外两个方向覆盖 ——
上面的调用侧与命令逻辑 —— 因此没有任何单个测试跨越边界，而契约仍从两端被钉住。

在 macOS 上用浏览器测试驱动真实 Rust 后端并不可行：`tauri-driver` 只支持
Windows 与 Linux；Tauri 官方在 macOS 上的路线
（`@wdio/tauri-service` 配 `driverProvider: "embedded"`）需要往应用里加入
`tauri-plugin-wdio-webdriver` 与 `tauri-plugin-wdio` —— 那是打进发布二进制里的
测试钩子。这个取舍被否决了；讨论见提交历史。

### 视觉回归

`e2e/*.png` 保存已提交的 Playwright 截图基线，覆盖已安装列表与详情抽屉。它们就是
预期结果，因此一次真实的视觉变化必须被评审，而不是被一次重跑吸收掉：

```bash
pnpm test:e2e:update   # 在有意改动之后重写基线
```

浏览器固定为 Chromium，并开启 `reducedMotion`，因为基线只有在同一个渲染器与同一
个动画状态下才可比。字体渲染跨平台仍有差异，因此在新机器上看到 1 像素的基线
差异时，应当视为「该重新生成基线」的信号，而不是缺陷。

## 覆盖率策略

阈值写在 `vite.config.ts` 里，由 `pnpm test:coverage` 强制执行。一个全局下限，
外加四组按 glob 分设的下限：

| 分组 | 下限 | 为何不同 |
| --- | --- | --- |
| 全局 | 84 / 80 / 82 / 86 | 比当前数字低两三个点 |
| `src/lib/*.ts` | 88 / 82 / 87 / 90 | 核心逻辑与 Tauri 边界 —— 这里下滑就是回归，无论总数怎么说 |
| `src/lib/registry/**` | 78 / 78 / 70 / 79 | 流式、缓存与 worker 管道：偏 I/O，且大多经 `worker-controller` 驱动 |
| `src/hooks/**` | 93 / 86 / 91 / 95 | React 状态，未覆盖的分支意味着一次陈旧渲染 |
| `src/components/ui/**` | 62 / 72 / 66 / 62 | 上游 shadcn/Base UI 封装，按项目政策原样引入 —— 是下限，不是目标 |

各组刻意互不重叠（`src/lib/*.ts` 止于目录边界，不会一并匹配
`src/lib/registry`），因此没有文件会被同时套上两条标准。Vitest 也会把命中 glob
的文件计入全局总数，所以这些分组是在全局下限之上**追加**要求，而非取代它。

`src/lib/mock-local.ts` 被排除。配置里的注释曾写它「从不发布」，那是错的：
`lib/local-skills` 静态导入它，并在 `isTauri()` 为 false 时用它服务 web 构建。
它被排除是因为它是测试替身，而不是因为它是死代码。

## jsdom 判不了的事

写断言之前，有两件事值得知道。

**没有 CSS 引擎。** 不管样式表写了什么，`getComputedStyle` 都报
`position: static`，因此无法通过渲染出的几何属性来验证一个 Tailwind 工具类。
当某个测试需要钉住一个工具类时，那个类**就是**唯一可用的证据，注释里应当说明
这一点。`repo-card.test.tsx` 与 `explore-page.test.tsx` 里之所以还留着少数此类
断言，原因就在这里 —— 替代方案将变成什么都不断言。

**axe 的 `incomplete` 结果不算失败。** jsdom 没有布局，依赖几何或已绘制像素的规则
（尤其是颜色对比度）判不出来，会返回 incomplete。`src/test/a11y.ts` 忽略它们，
只强制执行可静态判定的那一半 —— 而那正是手写查询最容易漏掉的部分。

## 约定

- 每个源文件配一个同目录的 `*.test.ts(x)`。
- 按角色与可访问名查询。源码里一处都没有 `getByTestId`；而 `data-testid` 能在
  它所指之物被重写后继续存活。
- 渲染树内用 `container`，portal 用 `baseElement`，两者都不用 `document`。
- 一个 `it` 一个断言，名字即断言本身。标题里用「and」连起两件事的，就是两个
  测试。
- 行为不使用快照。唯一提交进仓库的图片是视觉回归基线，它们是应用的截图。