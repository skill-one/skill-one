# Agent 图标

Agent 品牌图标从哪里来，以及如何渲染到屏幕上。

## 来源：内建的 `agents-info` 数据

Agent 图标**内建在本应用中**，取自
[`skill-one/agents-info`](https://github.com/skill-one/agents-info) 数据仓库：

- `agents.jsonl` — 每个 agent 一条 JSON 记录；`name` 字段是应用解析图标的
  键，`icon` 字段指向图标文件。
- `icons/` — 图标文件本体（SVG 与 PNG）。变体 agent（区域锁定版、CLI 版）
  与其母品牌共用同一文件。

`scripts/sync-agents-info.mjs`（`pnpm sync:agents`）把两者都复制进仓库
——清单存为 `public/agents/agents.jsonl`，文件存为
`public/agents/icons/`——并生成 `src/data/agent-icons.generated.ts`，内含
`name → icon` 映射及每个图标预计算好的线条颜色。启动完全离线：不下载
数据、不在运行时分析颜色、不做对 CORS 敏感的 canvas 读取。

新增 agent（或重绘 Logo）需要一次应用更新：重新运行 `pnpm sync:agents`，
并把刷新后的 `public/agents/` 与重新生成的表格一起提交。

## 加载链路

1. `hooks/use-agent-icons.ts` 对照生成表同步解析单个 agent —— 无请求、
   无缓存、无后台刷新。
2. 每个图标解析为唯一的本地候选：
   - 仓库相对路径（`icons/codex-color.svg`）→ 应用包内的
     `/agents/icons/codex-color.svg`（`public/agents/`）；
   - 绝对 https URL → 该 URL 本身，作为唯一候选。

`AgentIcon`（`components/agent-icon.tsx`）在没有专属图标时回退到通用 Bot
字形 —— 未知 agent 或 icon 为 null（内置兜底 agent）。

## 连线边缘色

Agent 关系图（`pages/agents/agent-graph.tsx`）的连线从 hub 灰渐变为该
agent 图标在 tile 处的平均色。这个平均色是**预计算而非渲染时测量**的：
同步脚本把每个图标光栅化（最长边 100px），用与运行时
`fast-average-color` 相同的 `sqrt` 平均算法逐文件写入一个 hex 到生成表。
`hooks/use-agent-edge-color.ts` 只是对该表的同步查表 —— 原有的
`fast-average-color` 依赖已移除；无法着色的图标（单色字形、未知文件）
解析为 `undefined`，其连线保持中性灰。

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

## 测试

- `lib/agent-icons.test.ts` —— 内建映射、本地候选、特性表、预计算边缘色。
- `hooks/use-agent-icons.test.ts` 与 `hooks/use-agent-edge-color.test.ts`
  —— 同步解析与中性回退。
- `pages/installed/agent-avatar-group.test.tsx` 与
  `pages/agents/agent-graph.test.tsx` mock 了 hook，布局测试不触碰网络。
