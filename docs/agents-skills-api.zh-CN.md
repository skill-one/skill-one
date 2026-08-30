# agents-skills 接口使用

[English](agents-skills-api.md) | [简体中文](agents-skills-api.zh-CN.md)

本项目通过 Tauri 后端（`src-tauri/src/skills.rs`）调用 `agents-skills` v0.9 的
[`Manager`](https://docs.rs/agents-skills/latest/agents_skills/struct.Manager.html)
门面，将技能安装与 agent 链接能力暴露给前端。前端经 `src/lib/skills-manager.ts`
的 `invoke` 封装访问这些 Tauri 命令。

> 库文档见 [docs.rs/agents-skills](https://docs.rs/agents-skills)。

## 依赖引入

```toml
# src-tauri/Cargo.toml
agents-skills = "0.9"
```

自 0.8 起，库的 `core` 模块不再公开：应用所需的一切都从 crate 根导出
（`Manager`、各请求/结果类型、`LinkOutcome`、`Env`、`Source`、`Skill`、
`agent_names()`）。应用不再触碰库的内部实现。

## Manager 构造

```rust
let manager = Manager::builder().cwd(p).build(); // 指定项目根目录（技能装到 ./agents/skills）
let manager = Manager::new();                    // 使用进程当前工作目录
```

## 用到的接口一览

| 项目功能（Tauri 命令） | `Manager` 方法 | 请求类型 | 返回类型 |
| --- | --- | --- | --- |
| 安装 / 预览技能 | `add` | `AddRequest` | `AddOutcome` |
| 列出已安装技能 | `list` | `ListRequest` | `Vec<ListedSkill>` |
| 卸载技能 | `remove` | `RemoveRequest` | `RemoveOutcome` |
| 停用技能 | `disable` | `DisableRequest` | `DisableOutcome` |
| 启用技能 | `enable` | `EnableRequest` | `EnableOutcome` |
| 链接 / 取消链接 agent | `agent` | `AgentRequest` | `AgentOutcome` |
| 查询 agent 链接状态 | `agent_status` | `bool`（global） | `Vec<AgentStatus>` |

## 各命令与请求字段的对应

| Tauri 命令 | 请求构造（`skills.rs`） |
| --- | --- |
| `install_skill` | `AddRequest { source, global, skills, list_only }` |
| `list_installed_skills` | `ListRequest { global, agents }` |
| `remove_skills` | `RemoveRequest { skills, global, all }` |
| `disable_skills` | `DisableRequest { skills, global, all }` |
| `enable_skills` | `EnableRequest { skills, global, all }` |
| `link_agents` | `AgentRequest { agents, global, unlink, migrate }` |
| `link_status` | `manager.agent_status(global)` |

> `full_depth`（0.8 已从 `AddRequest` 移除）与原先的 `remove_stray_files`
> 命令一并退场：0.9 起链接不再因目录已有内容而拒绝，应用也无需再代删散落文件。

## 消费的返回字段

- **`AddOutcome`**：`list_only`、`installed`（`name` + `canonical_path`）、`failed`（`skill` + `error`）、`skills`（发现列表，取 `name`）。
- **`AgentOutcome`**：`global`、`results: Vec<AgentLinkResult>`；每条 `AgentLinkResult` 含 `agent`、`display`、`outcome: LinkOutcome`。
- **`AgentStatus`**：`name`、`display`、`linked`、`canonical`、`internal_skills`、
  `internal_others`、`pending_backup`。对未链接的非原生 agent，库会自行对其目录内的
  私有内容分类——迁移时会采纳的 skills（`internal_skills`）与只随链接备份的杂项
  （`internal_others`），并报告上次链接留下的待恢复备份槽
  （`pending_backup: Option<BackupStatus>`，含 `path` + `items`）。应用不再自扫 agent 目录。
- **`DisableOutcome` / `EnableOutcome`**：前端只关心操作是否成功，`installed` / `requested` / `disabled`（或 `enabled`）等明细字段目前未消费。

## 0.9 起的链接语义

既有内容永不清除。链接一个目录中已有内容的 agent 时，整个目录会先被原样移入
该 agent 的备份槽（`.agents/backup-skills/<agent>`）；取消链接时恢复。带
`migrate` 时，skill 子目录改为被采纳进全局目录（同名冲突保留全局版本、agent
侧副本留在备份槽），仅杂项文件备份；对已链接的 agent 再次执行 `migrate`，会把
此前备份的 skills 采纳进全局目录。`Refused` 仅用于外来符号链接或备份槽中仍有
未处理内容两种情况。

## 用到的 `LinkOutcome` 变体

`skills.rs` 的 `agent_link_result` 将各变体映射为扁平的 camelCase DTO：

- `Linked { parked_skills, parked_others, backup_dir }` → `linked`
- `AlreadyLinked` → `alreadyLinked`
- `Migrated { moved, skipped, parked_others, backup_dir }` → `migrated`
- `Refused { reason }` → `refused`
- `Skipped` → `skipped`
- `Failed { error }` → `failed`
- `Unlinked { restored, restored_from }` → `unlinked`
- `NotLinked` → `notLinked`

## 描述信息提取

`ListedSkill` 不含 description，且库的 frontmatter 解析器已私有化，因此
`skills.rs` 自行读取每个技能的 `SKILL.md`：用本地基于 `serde_yaml` 的解析器
切分 `---` 围栏内的 frontmatter，并要求 `name` 与 `description` 同时存在
（与库的规则一致），块标量折叠为单行，任何异常一律返回 `None`。

## 前端类型镜像

`src/lib/skills-manager.ts` 以 camelCase 定义了上述返回类型的 TypeScript 镜像
（如 `InstalledSkill`、`AgentLinkResult`、`AgentStatus` 等），供 UI 层直接使用。
