# agents-skills 接口使用

本项目通过 Tauri 后端（`src-tauri/src/skills.rs`）调用 `agents-skills` v0.5 的
[`Manager`](https://docs.rs/agents-skills/latest/agents_skills/struct.Manager.html)
门面，将技能安装与 agent 链接能力暴露给前端。前端经 `src/lib/skills-manager.ts`
的 `invoke` 封装访问这些 Tauri 命令。

> 库文档见 [`agents-skills/docs/LIBRARY.md`](../../agents-skills/docs/LIBRARY.md)。

## 依赖引入

```toml
# src-tauri/Cargo.toml
agents-skills = "0.5"
```

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
| 更新技能 | `update` | `UpdateRequest` | `UpdateOutcome` |
| 链接 / 取消链接 agent | `agent` | `AgentRequest` | `AgentOutcome` |
| 查询 agent 链接状态 | `agent_status` | `bool`（global） | `Vec<AgentStatus>` |

## 各命令与请求字段的对应

| Tauri 命令 | 请求构造（`skills.rs`） |
| --- | --- |
| `install_skill` | `AddRequest { source, global, skills, list_only, full_depth }` |
| `list_installed_skills` | `ListRequest { global, agents }` |
| `remove_skills` | `RemoveRequest { skills, global, all }` |
| `update_skills` | `UpdateRequest { skills, scope: Scope }` |
| `link_agents` | `AgentRequest { agents, global, unlink, migrate }` |
| `link_status` | `manager.agent_status(global)` |

## 消费的返回字段

- **`AddOutcome`**：`list_only`、`installed`（`name` + `canonical_path`）、`failed`（`skill` + `error`）、`skills`（发现列表，取 `name`）。
- **`AgentOutcome`**：`global`、`results: Vec<AgentLinkResult>`；每条 `AgentLinkResult` 含 `agent`、`display`、`outcome: LinkOutcome`。
- **`AgentStatus`**：`name`、`display`、`linked`、`canonical`。

## 用到的 `LinkOutcome` 变体

`skills.rs` 的 `link_outcome_fields` 将下列变体映射为字符串状态返回给前端：

`Linked` / `AlreadyLinked` / `Migrated { moved, skipped }` / `Refused { skills, reason }` /
`Skipped` / `Failed { error }` / `Unlinked` / `NotLinked`

## 前端类型镜像

`src/lib/skills-manager.ts` 以 camelCase 定义了上述返回类型的 TypeScript 镜像
（如 `InstalledSkill`、`AgentLinkResult`、`AgentStatus` 等），供 UI 层直接使用。
