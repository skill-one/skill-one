# Agent 图标

Agent 品牌图标从哪里来，以及如何渲染到屏幕上。

## 来源：`agents-info` 数据仓库

Agent 图标**不再打包进本应用**。全部数据存放在
[`skill-one/agents-info`](https://github.com/skill-one/agents-info) 数据仓库：

- `agents.jsonl` — 每个 agent 一条 JSON 记录；`name` 字段是应用解析图标的
  键，`icon` 字段指向图标文件。
- `icons/` — 图标文件本体（SVG 与 PNG）。变体 agent（区域锁定版、CLI 版）
  与其母品牌共用同一文件。

由于数据仓库完整拥有 `name → icon` 映射，新增 agent 或更新 Logo 无需更新
应用即可生效。

## 加载链路

1. `lib/agent-icons.ts` 通过共享的 CDN 回退链（`lib/cdn-config.ts`）拉取
   `agents.jsonl`：用户配置的 CDN 优先，其次直连
   `raw.githubusercontent.com`，最后是默认 jsDelivr 镜像。
2. 清单逐行解析（损坏或异构的行会被跳过）为 `name → icon` 映射，并持久化
   到 `localStorage`（`skill-one.agentIcons`，带版本号）。
3. `hooks/use-agent-icons.ts` 通过一个共享的 react-query 查询
   （`["agent-icons"]`）暴露该映射。localStorage 中的副本作为
   `initialData` 注入查询，热启动时图标首帧即真实渲染；30 分钟过期后台
   刷新清单。刷新失败（离线）时屏幕上保留已注入的数据。
4. 每个图标文件解析为自己的候选链：
   - 仓库相对路径（`icons/codex-color.svg`）→ 同一条 CDN 回退链；
   - 绝对 https URL → 该 URL 本身，作为唯一候选。

`AgentIcon`（`components/agent-icon.tsx`）按加载失败逐个轮换候选 URL，
全部失败时回退到通用 Bot 字形 —— 包括未知 agent、icon 为 null、以及
首次运行即离线的情形。

## 渲染特性（traits）

部分图标需要数据仓库未描述的特殊处理。它们保存在 `lib/agent-icons.ts` 的
一个小型 `FILE_TRAITS` 表中，**以图标路径**（数据仓库的 `icon` 值）为键，
而非 agent 名 —— 这样当数据仓库把某个变体重新指向另一品牌的文件时，
特性会随图稿一起迁移：

- `mono` — 单色 `currentColor` 字形，作为 `<img>` 渲染时为黑色；暗色模式
  下反转为白色（Cline、Copilot、Windsurf 等）。
- `ground` — 表面绑定型图稿，两种模式下都固定画在对比衬底上（Kimi：
  透明底上的白色字形）。

没有条目的文件按原样渲染。数据仓库更换图标时，请检查原有特性是否仍然
适用 —— 例如 Cursor 已从单色字形换成彩色的 `cursor-color.svg`，随之取消
了 `mono` 标记。

## 缓存与离线行为

| 层级 | 覆盖内容 | 生命周期 |
|------|----------|----------|
| react-query 缓存 | 解析后的清单，被所有已挂载图标共享 | 会话内 |
| `localStorage` | 解析后的清单，下次启动时注入 | 直到下次成功刷新覆盖 |
| WebView HTTP 缓存 | 图标文件本身 | 随浏览器缓存策略 |

无网络且无本地副本时（首次运行即离线），所有 agent 回退到 Bot 字形。

## 测试

- `lib/agent-icons.test.ts` — 清单解析、持久化与离线回退、候选链、特性表。
- `pages/installed/agent-avatar-group.test.tsx` 与
  `pages/agents/agent-graph.test.tsx` mock 了 hook，布局测试不触碰网络。
