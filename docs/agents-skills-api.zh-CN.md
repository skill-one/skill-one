# agents-skills 接口使用

[English](agents-skills-api.md) | [简体中文](agents-skills-api.zh-CN.md)

本项目通过 Tauri 后端（`src-tauri/src/skills.rs`）调用 `agents-skills` v0.22 的
[`Manager`](https://docs.rs/agents-skills/latest/agents_skills/manager/struct.Manager.html)
门面，将技能安装与 agent 链接能力暴露给前端。前端经 `src/lib/skills-manager.ts`
的 `invoke` 封装访问这些 Tauri 命令。

> 库文档见 [docs.rs/agents-skills](https://docs.rs/agents-skills)。

## 依赖引入

```toml
# src-tauri/Cargo.toml
agents-skills = "0.22"
```

## 0.15–0.22 的主要变化

本项目最初基于 0.14 编写，之后跨越了八个 breaking 版本。下表的变化均已在
`skills.rs` 中体现：

| 版本 | 变化 | 对本项目的影响 |
| --- | --- | --- |
| 0.15 | 移除备份槽与 `--migrate`；链接变为单向 | `AgentRequest.migrate`、`AgentStatus.pending_backup` 删除；`LinkOutcome::Migrated` 删除；`Linked` 改携带 `adopted` / `quarantined` / `conflicts`；`Unlinked` 不再携带字段 |
| 0.16 | `ListedSkill` 新增 `description` 与 `installed_at` | 应用不再自行解析 `SKILL.md` frontmatter，`yaml_serde` 依赖随之删除 |
| 0.17 | `add` 不再覆盖（新增 `AddOutcome.skipped`）；移除项目级作用域 | `global` 系列字段、`ListRequest`、`Agent.skills_dir`、`is_universal()` 删除；`Manager::list` 不再接收请求 |
| 0.18 | `list` 短暂新增 `estimated_tokens` | 在其存在的一天里，详情抽屉展示了描述常驻上下文的估算开销 |
| 0.19 | 回退 0.18 的 token 估算：`ListedSkill.estimated_tokens` 与整个 `core::tokens` 模块删除 | `list` 回到 0.16 的形态，应用侧的镜像字段随之删除 |
| 0.20 | `ListedSkill.name` 改为技能在磁盘上的目录名，且 `ListedSkill` / `list --json` 移除 `path`（改用新的 `Manager::skill_dir` 解析目录） | 应用的 DTO 随之删除 `path`；`read_skill_md` 与 `compute_skill_hash` 改经 `skill_dir` 解析目录 |
| 0.21 | 一个 source 只对应一个技能：`AddRequest` 缩减为 `{ source, reference }`，`AddOutcome` 缩减为 `{ source, skill, canonical_path, skipped }`，失败改为返回 `Err`（`InstallSuccess` / `InstallFailure` 删除）；source 只剩本地技能目录与 `owner/repo@<skill>` 两种形式，远程安装改走 GitHub API（git clone / zip / tar / URL 等 source 形式删除） | `install_skill` 只接收一个 `source` 字符串，返回 `{ skill, skipped }`；安装失败即命令的 `Err`，也就是前端的 rejection |
| 0.22 | 技能的身份永远是目录 basename——`SKILL.md` frontmatter 的 `name` 不再被读取或参与匹配；`owner/repo@<skill>` 在仓库树中按 basename（不区分大小写）匹配最浅的目录，只下载该目录；缺失或无法解析的 `SKILL.md` 不再致命 | 商店的 skill slug 原样放进 source；其余无需改动 |

### 更早的变化

- **0.14** 把 `list` 简化为纯目录扫描：`ListRequest` 移除了 `agents` 字段，
  `ListedSkill` 也不再携带 `scope` / `agents`——哪些 agent 能看到某个 skill 是
  scope 级别的状态，因此按 skill 的报告被删除，改由 `agent_status` 查询链接状态。
- **0.13** 彻底移除了 lockfile（`skills-lock.json`）：`list` / `remove` 仅靠扫描
  规范目录驱动，`ListedSkill` 不再报告 `source` / `source_url` / `source_type`；
  `update` API 也被移除，刷新技能的唯一方式是 `remove` + `add`。安装自 0.13 起是
  原子的（先暂存到 `.incoming-*`，再改名就位）。

对本项目的后果：已安装技能无法再追溯回其来源仓库，因此应用维护自己的来源台账
（见 `docs/skill-provenance.md`），而商店的「已安装」判定只能按名称匹配。

自 0.8 起库的 `core` 模块为私有：应用所需的一切都从 crate 根重新导出
（`Manager`、request/outcome 类型、`LinkOutcome`、`Env`、`Source`、`Skill`、
`agent_names()`）。应用不再触达内部实现。

## 构造 Manager

应用只使用用户级技能目录（`~/.agents/skills`）；自 0.17 起已没有其它作用域可选，
因此代码始终构造 `Manager::new()`：

```rust
let manager = Manager::new();   // 解析真实的 home / config / cwd
let manager = Manager::builder().home(p).config(c).cwd(w).build(); // 沙盒
```

## 使用到的 API

| 功能（Tauri 命令） | `Manager` 方法 | 请求类型 | 返回类型 |
| --- | --- | --- | --- |
| 安装 / 预览技能 | `add` | `AddRequest` | `AddOutcome` |
| 列出已安装技能 | `list` | —（无参数） | `Vec<ListedSkill>` |
| 卸载技能 | `remove` | `RemoveRequest` | `RemoveOutcome` |
| 停用技能 | `disable` | `DisableRequest` | `DisableOutcome` |
| 启用技能 | `enable` | `EnableRequest` | `EnableOutcome` |
| 链接 / 取消链接 agent | `agent` | `AgentRequest` | `AgentOutcome` |
| 查询 agent 链接状态 | `agent_status` | —（无参数） | `Vec<AgentStatus>` |

## 命令与请求的对应关系

| Tauri 命令 | 请求构造（`skills.rs`） |
| --- | --- |
| `install_skill` | `AddRequest::new(source)`——`source` 即 `owner/repo@<skill>` |
| `list_installed_skills` | `manager.list()` |
| `remove_skills` | `RemoveRequest { skills, all: false }` |
| `set_skills_enabled` | `DisableRequest` / `EnableRequest { skills, all }` |
| `link_agents` | `AgentRequest { agents, unlink }` |
| `link_status` | `manager.agent_status()` |

## 消费到的返回字段

- **`AddOutcome`**：应用只读取 `skill.name`（安装后技能的磁盘目录名——即
  `remove` / `disable` / `enable` 使用的身份）与 `skipped`（同名技能已存在——无论
  启用还是停用——因此未复制任何内容）。安装失败不会以 DTO 形式出现：`add` 返回
  `Err`，它成为命令的 `Err`、也就是前端的 rejection，库给出的错误信息就是读者看到的
  失败原因。
- **`ListedSkill`**：`name`、`description`（单行，库自身已折叠块标量）、`enabled`、
  `installed_at`（`Option<u64>`，Unix 秒；不记录创建时间的文件系统为 `None`）。
  应用把这四个字段原样透传为 `ListedSkillDto`——本地不再提取任何内容。
  （`path` 在 0.19 及之前存在，0.20 起改用 `Manager::skill_dir` 解析目录；
  `estimated_tokens` 仅在 0.18 到 0.19 之间短暂存在。）
- **`AgentOutcome`**：`results: Vec<AgentLinkResult>`；每条 `AgentLinkResult` 含
  `agent`、`display`、`outcome: LinkOutcome`。
- **`AgentStatus`**：`name`、`display`、`linked`、`canonical`、`internal_skills`、
  `internal_others`。对未链接的非原生 agent，库会对 agent 目录内的私有内容分类：
  链接时会收编的 skills（`internal_skills`）与会被隔离的杂项
  （`internal_others`）。应用不再自扫 agent 目录。
- **`DisableOutcome` / `EnableOutcome`**：应用返回发生移动的名字（`disabled` /
  `enabled`），其余丢弃——`requested`、`already`、`missing` 与 `installed` 清单
  描述的是一次前端从不发起的无参调用。

## 0.15 起的链接语义

链接是**单向**的。`agent --link` 会把 agent 自带的 skills 移入规范目录（规范目录
已有的同名副本胜出，agent 侧副本被丢弃），把非技能条目移入规范目录内的
`.misc/<agent>/`，然后创建目录符号链接。`unlink` 只断开符号链接：被收编的 skills
留在规范目录，此后由 `remove` / `disable` 管理。`Refused` 现在只剩一种情况——
agent 的技能目录是指向别处的符号链接。

## 使用到的 `LinkOutcome` 变体

`skills.rs` 的 `agent_link_result` 将各变体映射为扁平的 camelCase DTO：

- `Linked { adopted, quarantined, conflicts }` → `linked`
- `AlreadyLinked` → `alreadyLinked`
- `Refused { reason }` → `refused`
- `Skipped` → `skipped`
- `Failed { error }` → `failed`
- `Unlinked` → `unlinked`
- `NotLinked` → `notLinked`

## 描述与安装时间

`skills.rs` 过去需要自己读取每个技能的 `SKILL.md`，因为 `ListedSkill` 不携带描述，
且库的 frontmatter 解析器是私有的。自 0.16 起库直接报告描述（已折叠为单行）与技能
目录的创建时间。因此本地的 YAML 解析与 `yaml_serde` 依赖都已删除，后端如今是纯
透传。

应用只在技能详情抽屉中展示这个安装时间，以"多久之前落盘"的形式呈现——行内显示
相对时间 `3天前`（由 `Intl.RelativeTimeFormat` 渲染），悬停显示精确日期；卡片保持
极简，不含它。0.18 的描述 token 估算本会与它并列，但 0.19 删除了该字段，应用侧的
镜像也随之移除。

## 前端类型镜像

`src/lib/skills-manager.ts` 为上述返回类型定义了 camelCase 的 TypeScript 镜像
（如 `InstalledSkill`、`AgentLinkResult`、`AgentStatus`），供 UI 层直接使用。
