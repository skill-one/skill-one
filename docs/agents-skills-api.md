# Using the agents-skills API

[English](agents-skills-api.md) | [简体中文](agents-skills-api.zh-CN.md)

Through the Tauri backend (`src-tauri/src/skills.rs`), this project calls the
[`Manager`](https://docs.rs/agents-skills/latest/agents_skills/struct.Manager.html)
facade of `agents-skills` v0.9 to expose skill installation and agent-linking
capabilities to the frontend. The frontend reaches these Tauri commands via the
`invoke` wrapper in `src/lib/skills-manager.ts`.

> Library docs: [docs.rs/agents-skills](https://docs.rs/agents-skills).

## Dependency

```toml
# src-tauri/Cargo.toml
agents-skills = "0.9"
```

Since 0.8 the library's `core` module is private: everything the app needs is
re-exported from the crate root (`Manager`, the request/outcome types,
`LinkOutcome`, `Env`, `Source`, `Skill`, `agent_names()`). The app no longer
reaches into internals.

## Constructing the Manager

```rust
let manager = Manager::builder().cwd(p).build(); // project root (skills install to ./agents/skills)
let manager = Manager::new();                    // process current working directory
```

## API surface in use

| Feature (Tauri command) | `Manager` method | Request type | Return type |
| --- | --- | --- | --- |
| Install / preview skills | `add` | `AddRequest` | `AddOutcome` |
| List installed skills | `list` | `ListRequest` | `Vec<ListedSkill>` |
| Uninstall skills | `remove` | `RemoveRequest` | `RemoveOutcome` |
| Disable skills | `disable` | `DisableRequest` | `DisableOutcome` |
| Enable skills | `enable` | `EnableRequest` | `EnableOutcome` |
| Link / unlink agents | `agent` | `AgentRequest` | `AgentOutcome` |
| Query agent link status | `agent_status` | `bool` (global) | `Vec<AgentStatus>` |

## Command-to-request mapping

| Tauri command | Request construction (`skills.rs`) |
| --- | --- |
| `install_skill` | `AddRequest { source, global, skills, list_only }` |
| `list_installed_skills` | `ListRequest { global, agents }` |
| `remove_skills` | `RemoveRequest { skills, global, all }` |
| `disable_skills` | `DisableRequest { skills, global, all }` |
| `enable_skills` | `EnableRequest { skills, global, all }` |
| `link_agents` | `AgentRequest { agents, global, unlink, migrate }` |
| `link_status` | `manager.agent_status(global)` |

> `full_depth` (removed from `AddRequest` in 0.8) and the former
> `remove_stray_files` command are gone: since 0.9 a link never refuses because
> of existing content, so there are no strays left for the app to delete.

## Consumed return fields

- **`AddOutcome`**: `list_only`, `installed` (`name` + `canonical_path`), `failed` (`skill` + `error`), `skills` (discovered list; `name` is used).
- **`AgentOutcome`**: `global`, `results: Vec<AgentLinkResult>`; each `AgentLinkResult` carries `agent`, `display`, and `outcome: LinkOutcome`.
- **`AgentStatus`**: `name`, `display`, `linked`, `canonical`, `internal_skills`,
  `internal_others`, `pending_backup`. For unlinked, non-canonical agents the
  library itself classifies the agent dir's private content — skills that a
  migrate would adopt (`internal_skills`) and non-skill entries that only park
  (`internal_others`) — and reports a backup slot parked by a previous link
  (`pending_backup: Option<BackupStatus>` with `path` + `items`). The app no
  longer scans agent dirs itself.
- **`DisableOutcome` / `EnableOutcome`**: the frontend only cares whether the operation succeeded; detail fields such as `installed` / `requested` / `disabled` (or `enabled`) are currently unused.

## Link semantics since 0.9

Pre-existing content is never destroyed. Linking an agent whose dir holds
content parks the whole dir into the agent's backup slot
(`.agents/backup-skills/<agent>`); `unlink` restores it. With `migrate`, skill
subdirs are adopted into the canonical dir instead (name clashes keep the
canonical copy and stay parked), and only non-skill entries park. Rerunning
`migrate` on an already linked agent adopts skills parked by an earlier link.
`Refused` is reserved for a foreign symlink or a stale non-empty backup slot.

## `LinkOutcome` variants in use

`skills.rs`'s `agent_link_result` maps the variants to a flat camelCase DTO:

- `Linked { parked_skills, parked_others, backup_dir }` → `linked`
- `AlreadyLinked` → `alreadyLinked`
- `Migrated { moved, skipped, parked_others, backup_dir }` → `migrated`
- `Refused { reason }` → `refused`
- `Skipped` → `skipped`
- `Failed { error }` → `failed`
- `Unlinked { restored, restored_from }` → `unlinked`
- `NotLinked` → `notLinked`

## Description extraction

`ListedSkill` carries no description, and since the library's frontmatter
parser is private, `skills.rs` reads each skill's `SKILL.md` itself: a local
`serde_yaml`-based parser splits the `---`-fenced frontmatter and requires
both `name` and `description` (mirroring the library's rules), folds block
scalars to a single line, and yields `None` on any deviation.

## Frontend type mirrors

`src/lib/skills-manager.ts` defines camelCase TypeScript mirrors of the return
types above (e.g. `InstalledSkill`, `AgentLinkResult`, `AgentStatus`) for direct
use by the UI layer.
