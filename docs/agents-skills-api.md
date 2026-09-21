# Using the agents-skills API

[English](agents-skills-api.md) | [简体中文](agents-skills-api.zh-CN.md)

Through the Tauri backend (`src-tauri/src/skills.rs`), this project calls the
[`Manager`](https://docs.rs/agents-skills/latest/agents_skills/manager/struct.Manager.html)
facade of `agents-skills` v0.19 to expose skill installation and agent-linking
capabilities to the frontend. The frontend reaches these Tauri commands via the
`invoke` wrapper in `src/lib/skills-manager.ts`.

> Library docs: [docs.rs/agents-skills](https://docs.rs/agents-skills).

## Dependency

```toml
# src-tauri/Cargo.toml
agents-skills = "0.19"
```

## What 0.15–0.19 changed

Five breaking releases separate the API this app was written against (0.14)
from the current one. Everything below is reflected in `skills.rs`:

| Version | Change | Effect here |
| --- | --- | --- |
| 0.15 | Backup slot and `--migrate` removed; linking is one-way | `AgentRequest.migrate` and `AgentStatus.pending_backup` gone; `LinkOutcome::Migrated` removed; `Linked` now carries `adopted` / `quarantined` / `conflicts`; `Unlinked` carries nothing |
| 0.16 | `ListedSkill` gained `description` and `installed_at` | The app no longer parses `SKILL.md` frontmatter itself; the `yaml_serde` dependency was dropped |
| 0.17 | `add` never overwrites (`AddOutcome.skipped`); project scope removed | `global` flags, `ListRequest`, `Agent.skills_dir`, `is_universal()` gone; `Manager::list` takes no request |
| 0.18 | `list` briefly reported `estimated_tokens` | The drawer showed the description's resident context cost for the day this existed |
| 0.19 | 0.18's token estimate reverted: `ListedSkill.estimated_tokens` and the whole `core::tokens` module removed | `list` is back to its 0.16 shape, and the app's mirror of the field was removed with it |

### Earlier changes

- **0.14** simplified `list` to a pure directory scan: `ListRequest` lost its
  `agents` field and `ListedSkill` no longer carries `scope` / `agents` —
  which agents see a skill is scope-level state, so per-skill agent reporting
  was dropped. Use `agent_status` to inspect link state.
- **0.13** removed the lockfile (`skills-lock.json`) entirely: `list` and
  `remove` are driven by a scan of the canonical directory alone, and
  `ListedSkill` no longer reports `source` / `source_url` / `source_type`. The
  `update` API was removed too — refreshing a skill means `remove` + `add`.
  Installs are atomic (staged into `.incoming-*`, then renamed into place).

Consequence for this app: an installed skill can no longer be tied back to the
repo it was installed from, so the app keeps its own provenance ledger
(`docs/skill-provenance.md`) and the store's 已安装 detection matches by name
only.

Since 0.8 the library's `core` module is private: everything the app needs is
re-exported from the crate root (`Manager`, the request/outcome types,
`LinkOutcome`, `Env`, `Source`, `Skill`, `agent_names()`). The app no longer
reaches into internals.

## Constructing the Manager

The app only uses the user-level skills directory (`~/.agents/skills`); since
0.17 there is no other scope to choose from, so the code always builds
`Manager::new()`:

```rust
let manager = Manager::new();   // resolves the real home / config / cwd
let manager = Manager::builder().home(p).config(c).cwd(w).build(); // sandboxed
```

## API surface in use

| Feature (Tauri command) | `Manager` method | Request type | Return type |
| --- | --- | --- | --- |
| Install / preview skills | `add` | `AddRequest` | `AddOutcome` |
| List installed skills | `list` | — (no arguments) | `Vec<ListedSkill>` |
| Uninstall skills | `remove` | `RemoveRequest` | `RemoveOutcome` |
| Disable skills | `disable` | `DisableRequest` | `DisableOutcome` |
| Enable skills | `enable` | `EnableRequest` | `EnableOutcome` |
| Link / unlink agents | `agent` | `AgentRequest` | `AgentOutcome` |
| Query agent link status | `agent_status` | — (no arguments) | `Vec<AgentStatus>` |

## Command-to-request mapping

| Tauri command | Request construction (`skills.rs`) |
| --- | --- |
| `install_skill` | `AddRequest { source, skills, list_only }` |
| `list_installed_skills` | `manager.list()` |
| `remove_skills` | `RemoveRequest { skills, all }` |
| `set_skills_enabled` | `DisableRequest` / `EnableRequest { skills, all }` |
| `link_agents` | `AgentRequest { agents, unlink }` |
| `link_status` | `manager.agent_status()` |

## Consumed return fields

- **`AddOutcome`**: `list_only`, `installed` (`name` + `canonical_path`),
  `skipped` (names left untouched because they are already installed),
  `failed` (`skill` + `error`), `skills` (discovered list; `name` is used).
- **`ListedSkill`**: `name`, `description` (single line — the library folds
  block scalars itself), `path` (the directory the skill *currently* lives in,
  i.e. `disabled-skills` for a parked one), `enabled`, `installed_at`
  (`Option<u64>`, Unix seconds; `None` on filesystems that record no creation
  time). The app passes all five straight through as its `ListedSkillDto` —
  nothing is extracted locally any more. (`estimated_tokens` existed between
  0.18 and 0.19 only.)
- **`AgentOutcome`**: `results: Vec<AgentLinkResult>`; each `AgentLinkResult`
  carries `agent`, `display`, and `outcome: LinkOutcome`.
- **`AgentStatus`**: `name`, `display`, `linked`, `canonical`,
  `internal_skills`, `internal_others`. For unlinked, non-canonical agents the
  library classifies the agent dir's private content — skills that a link
  would adopt (`internal_skills`) and non-skill entries that would be
  quarantined (`internal_others`). The app does not scan agent dirs itself.
- **`DisableOutcome` / `EnableOutcome`**: the frontend only cares whether the
  operation succeeded; detail fields such as `installed` / `requested` /
  `disabled` (or `enabled`) are currently unused.

## Link semantics since 0.15

Linking is **one-way**. `agent --link` moves an agent's own skills into the
canonical dir (a name that already exists there wins, and the agent-side copy
is dropped), moves non-skill entries into `.misc/<agent>/` inside the canonical
dir, and creates the directory symlink. `unlink` only breaks the symlink: the
adopted skills stay canonical and are managed by `remove` / `disable` from then
on. `Refused` is now reserved for one case — the agent's skills dir is a
foreign symlink.

## `LinkOutcome` variants in use

`skills.rs`'s `agent_link_result` maps the variants to a flat camelCase DTO:

- `Linked { adopted, quarantined, conflicts }` → `linked`
- `AlreadyLinked` → `alreadyLinked`
- `Refused { reason }` → `refused`
- `Skipped` → `skipped`
- `Failed { error }` → `failed`
- `Unlinked` → `unlinked`
- `NotLinked` → `notLinked`

## Description and install time

`skills.rs` used to read every skill's `SKILL.md` itself, because `ListedSkill`
carried no description and the library's frontmatter parser was private. Since
0.16 the library reports the description (already folded onto one line) and the
skill directory's creation time itself. The local YAML parsing and the
`yaml_serde` dependency are therefore gone; the backend is now a pure
pass-through.

The app shows that install time in the skill detail drawer only, as how long ago
the skill landed on disk — relative on the row (`3天前`, via
`Intl.RelativeTimeFormat`) with the exact date on hover. The card stays free of
it. 0.18's description token estimate would have sat beside it; 0.19 removed the
field, so the app's mirror of it is gone too.

## Frontend type mirrors

`src/lib/skills-manager.ts` defines camelCase TypeScript mirrors of the return
types above (e.g. `InstalledSkill`, `AgentLinkResult`, `AgentStatus`) for direct
use by the UI layer.
