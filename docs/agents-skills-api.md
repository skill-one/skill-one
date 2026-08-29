# Using the agents-skills API

[English](agents-skills-api.md) | [简体中文](zh-CN/agents-skills-api.md)

Through the Tauri backend (`src-tauri/src/skills.rs`), this project calls the
[`Manager`](https://docs.rs/agents-skills/latest/agents_skills/struct.Manager.html)
facade of `agents-skills` v0.7 to expose skill installation and agent-linking
capabilities to the frontend. The frontend reaches these Tauri commands via the
`invoke` wrapper in `src/lib/skills-manager.ts`.

> Library docs: [docs.rs/agents-skills](https://docs.rs/agents-skills).

## Dependency

```toml
# src-tauri/Cargo.toml
agents-skills = "0.7"
```

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
| Update skills | `update` | `UpdateRequest` | `UpdateOutcome` |
| Disable skills | `disable` | `DisableRequest` | `DisableOutcome` |
| Enable skills | `enable` | `EnableRequest` | `EnableOutcome` |
| Link / unlink agents | `agent` | `AgentRequest` | `AgentOutcome` |
| Query agent link status | `agent_status` | `bool` (global) | `Vec<AgentStatus>` |

> `remove_stray_files` does not go through `Manager`: it only deletes stray files
> inside the agents' own directories and is implemented directly in `skills.rs`
> (`remove_strays`, with path-escape and directory protection).

## Command-to-request mapping

| Tauri command | Request construction (`skills.rs`) |
| --- | --- |
| `install_skill` | `AddRequest { source, global, skills, list_only, full_depth }` |
| `list_installed_skills` | `ListRequest { global, agents }` |
| `remove_skills` | `RemoveRequest { skills, global, all }` |
| `update_skills` | `UpdateRequest { skills, scope: Scope }` |
| `disable_skills` | `DisableRequest { skills, global, all }` |
| `enable_skills` | `EnableRequest { skills, global, all }` |
| `link_agents` | `AgentRequest { agents, global, unlink, migrate }` |
| `link_status` | `manager.agent_status(global)` |

## Consumed return fields

- **`AddOutcome`**: `list_only`, `installed` (`name` + `canonical_path`), `failed` (`skill` + `error`), `skills` (discovered list; `name` is used).
- **`AgentOutcome`**: `global`, `results: Vec<AgentLinkResult>`; each `AgentLinkResult` carries `agent`, `display`, and `outcome: LinkOutcome`.
- **`AgentStatus`**: `name`, `display`, `linked`, `canonical`, `internal_skills`; `skills.rs` additionally scans `internal_files` (stray files that cannot be migrated) and `dir_path` (the agent's own skills directory) for unlinked agents, for UI preview.
- **`DisableOutcome` / `EnableOutcome`**: the frontend only cares whether the operation succeeded; detail fields such as `installed` / `requested` / `disabled` (or `enabled`) are currently unused.

## `LinkOutcome` variants in use

`skills.rs`'s `link_outcome_fields` maps the following variants to string states for the frontend:

`Linked` / `AlreadyLinked` / `Migrated { moved, skipped }` / `Refused { skills, reason }` /
`Skipped` / `Failed { error }` / `Unlinked` / `NotLinked`

## Frontend type mirrors

`src/lib/skills-manager.ts` defines camelCase TypeScript mirrors of the return
types above (e.g. `InstalledSkill`, `AgentLinkResult`, `AgentStatus`) for direct
use by the UI layer.
