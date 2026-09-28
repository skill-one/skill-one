# 活动日志

[English](activity-log.md) | [简体中文](activity-log.zh-CN.md)

一份 append-only 记录：应用对用户的技能与 Agent 所做的每一次有实际影响的
操作——改了什么，以及为什么。

## 问题

应用会动用户机器上的东西：安装、卸载、启停、编辑技能，关联 Agent 目录，把
技能关联到它的商店来源。其中一部分并非用户按下按钮触发（自动关联 Agent、
按内容哈希自动关联、扫描发现有人手工放入的技能）。provenance ledger
（`docs/skill-provenance.md`）回答的是*每个技能现在来自哪里*，但没有任何东西
回答*曾经发生过什么*。活动日志就是这份记录。

## 记录什么

每个动作一行，且只记录真正有影响的操作。读取类（`list`、读取 `SKILL.md`、
`link_status`）与后台刷新（registry 快照、更新检查）都不记录；没有改变任何
状态的结果（`alreadyLinked` 的 Agent、被跳过的安装）同样不记录。

| `event` | `actor` | `target` | `detail` |
| --- | --- | --- | --- |
| `skill.install` | `user` | skill | `{ repo, skipped }` |
| `skill.remove` | `user` | skill(s) | `{ count }` |
| `skill.enable` / `skill.disable` | `user` | skill(s) | `{ count }` |
| `skill.edit` | `user` | skill | `{}` |
| `skill.discover` | `scan` | skill | `{ origin: "store" \| "external" }` |
| `agent.link` | `auto` / `user` | agent | `{ status, adopted, quarantined, conflicts }` |
| `agent.unlink` | `user` | agent | `{ status }` |
| `source.link` | `auto` / `user` | skill | `{ repo, reason }` |

- **`actor`** 承载了你所要的"原因"标注：`user` 表示用户主动操作，`auto` 表示
  自动过程（自动关联扫描、哈希/描述关联分级），`scan` 表示发现扫描。
- **`source.link.reason`** 取 `install`、`hash`、`description`、`confirm` 之一
  ——说明这次关联是如何决定的。
- 自动关联与手动关联无需额外传参即可区分：`linkAllAgents` 是自动入口，
  `linkAgent` 是手动入口。

### 只报"新发现"，不刷屏

每次加载已安装列表都会跑一次 reconcile，若每次扫描都记录会把日志淹没。因此只
报告*新增*的技能。已确认过的名字集合会持久化（`skill-one.activity.seen`），
并且**首次**扫描会把当前已安装集合静默采纳为**基线**——新装这个应用时，不应
把此前已有的技能全部报成"新发现"。商店安装本身已经写了 `skill.install`，故
不会被重复计数。

## 存储

```
<app_log_dir>/activity.jsonl        # macOS: ~/Library/Logs/com.skill-one.app/
<app_log_dir>/activity.jsonl.1      # 唯一的轮转备份
```

放在系统日志目录（而非 provenance ledger 所在的技能目录），因为这是应用产生的
历史，而非技能状态。用 JSONL 是因为这是事件流：每行自描述、顺序有意义、永不
覆盖。

每行一条记录：

```jsonc
{"ts":"2026-09-28T08:00:00.000Z","event":"agent.link","actor":"auto",
 "target":{"kind":"agent","names":["cursor"]},
 "detail":{"status":"linked","adopted":3,"quarantined":1,"conflicts":0},
 "result":"ok"}
```

`result` 为 `ok` 或 `failed`；失败会带一个 `error` 字符串。文件在 2 MiB 时轮转：
当前日志移到 `activity.jsonl.1`（替换更旧的备份），随后新建文件。查看器读取
两个文件中最新的 500 条记录。

## 后端接口

`src-tauri/src/activity.rs` 保持"薄"——解析路径、追加、尾部读取、轮转、清空、
打开目录。Rust 侧不含任何 schema 知识；解析、容错策略与发现基线全在前端。

| 命令 | 行为 |
| --- | --- |
| `append_activity` | 追加一行 JSON；目录不存在则创建，达到上限则先轮转 |
| `read_activity` | 最新的 `limit` 行（默认 500），由旧到新，跨当前日志与备份 |
| `clear_activity` | 删除日志与其备份 |
| `open_activity_dir` | 在系统文件管理器中显示该目录 |

路径全部在内部解析为 `<app_log_dir>`（`AppHandle::path`），不接受调用方传入的
路径。

## 前端

- **`src/lib/activity.ts`**：schema（`ActivityRecord`）、`logActivity`、
  `readActivity`、逐行容错解析、发现基线（`logSkillDiscoveries`），以及浏览器
  替身（有上限的 localStorage 环形缓冲，使 dev server 与测试在没有原生环境时
  依然完全可用）。
- **记录是 best-effort**：写入失败被吞掉，与 provenance ledger 一致，因此它
  永远不会让它所记录的操作失败（或变慢）。容错按行——坏行跳过，其余保留。
- **埋点**在语义边界上完成，此处"原因"已知：`src/lib/local-skills.ts` 记录
  安装/卸载/启停/关联/断开关联/编辑；`src/lib/provenance.ts` 连同 `reason`
  记录来源关联；`src/hooks/use-skill-provenance.ts` 在每次 reconcile 后记录
  发现。

## 展示

查看器是一个从设置 popover（`活动日志`）打开的对话框，与高级设置并列——高频
开关用轻量浮层，需要管理的真实内容用完整界面，正是该 popover 已有的分工。

- 最新在上，按本地日期分组（`今天` / `昨天` / 日期）。
- 每条记录一行：一个带语义色的标记、一行摘要（非用户自己发起时带一个小的
  「自动」/「扫描」标签）、可选的明细行，以及相对时间
  （`Intl.RelativeTimeFormat`，无额外依赖）。
- 筛选：类别 chips（技能 / Agent / 来源）与"包含自动操作"开关。
- 底部：在文件管理器中显示日志，或清空（带确认）。

行的渲染是一张表（`src/lib/activity-notice.ts`）——每个事件类型一条，形状与
`src/lib/link-notice.ts` 处理关联结果时相同，因此新增事件类型只加一条，而非
写平行的 switch 分支。
