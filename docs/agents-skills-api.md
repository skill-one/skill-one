# Using the agents-skills API

[English](agents-skills-api.md) | [简体中文](agents-skills-api.zh-CN.md)

Through the Tauri backend (`src-tauri/src/skills.rs`), this project calls the
[`Manager`](https://docs.rs/agents-skills/latest/agents_skills/manager/struct.Manager.html)
facade of `agents-skills` v0.28 to expose skill installation and agent-linking
capabilities to the frontend. The frontend reaches these Tauri commands via the
`invoke` wrapper in `src/lib/skills-manager.ts`.

> Library docs: [docs.rs/agents-skills](https://docs.rs/agents-skills).

## Dependency

```toml
# src-tauri/Cargo.toml
agents-skills = "0.28"
```

## What 0.15–0.28 changed

Eleven breaking releases separate the API this app was written against (0.14)
from the current one. Everything below is reflected in `skills.rs`:

| Version | Change | Effect here |
| --- | --- | --- |
| 0.15 | Backup slot and `--migrate` removed; linking is one-way | `AgentRequest.migrate` and `AgentStatus.pending_backup` gone; `LinkOutcome::Migrated` removed; `Linked` now carries `adopted` / `quarantined` / `conflicts`; `Unlinked` carries nothing |
| 0.16 | `ListedSkill` gained `description` and `installed_at` | The app no longer parses `SKILL.md` frontmatter itself; the `yaml_serde` dependency was dropped |
| 0.17 | `add` never overwrites (`AddOutcome.skipped`); project scope removed | `global` flags, `ListRequest`, `Agent.skills_dir`, `is_universal()` gone; `Manager::list` takes no request |
| 0.18 | `list` briefly reported `estimated_tokens` | The drawer showed the description's resident context cost for the day this existed |
| 0.19 | 0.18's token estimate reverted: `ListedSkill.estimated_tokens` and the whole `core::tokens` module removed | `list` is back to its 0.16 shape, and the app's mirror of the field was removed with it |
| 0.20 | `ListedSkill.name` is the on-disk directory name, and `path` is gone from `ListedSkill` / `list --json` (resolve a directory with the new `Manager::skill_dir`) | The app's DTO drops `path` with it; `read_skill_md` and `analyze_skill` resolve the directory through `skill_dir` |
| 0.21 | One source is one skill: `AddRequest` reduced to `{ source, reference }`, `AddOutcome` reduced to `{ source, skill, canonical_path, skipped }`, failures returned as `Err` (`InstallSuccess` / `InstallFailure` gone); sources reduced to a local skill directory or `owner/repo@<skill>`, resolved through the GitHub API (git clone / zip / tar / URL sources removed) | `install_skill` takes one `source` string and returns `{ skill, skipped }`; a failed install is the command's `Err` and the frontend's rejection |
| 0.22 | A skill's identity is always its directory basename — the `SKILL.md` frontmatter `name` is no longer read or matched anywhere; `owner/repo@<skill>` searches the repository tree for a directory whose basename matches (shallowest wins) and downloads only that directory; a missing or unparseable `SKILL.md` is no longer fatal | The store's skill slug is sent verbatim inside the source; nothing else had to change |
| 0.23 | Remote installs are one tarball request to `codeload.github.com` (unpacked, matched locally): the GitHub REST API and its anonymous rate limit are gone, as are `GITHUB_TOKEN`, Git LFS resolution, and abbreviated-SHA refs | No code change — the public types used here (`AddRequest`, `Manager`) are unchanged; only comments/docs describing the fetch mechanism were updated |
| 0.24 | When `owner/repo@<skill>` matches no skill directory, a `SKILL.md` at the repository root now silently installs the whole repository under the repository name, instead of failing unless the requested name equaled the repository name; a directory match still wins | No code change — the public types are unchanged; only comments/docs describing the fallback were updated |
| 0.25 | The agent table's `global` field is renamed to `skills_dir`, and the table is now sourced from the upstream [`skill-one/agents-info`](https://github.com/skill-one/agents-info); three stale agents (`jazz`, `loaf`, `promptscript`) are removed | No code change — the app never reads the agent table's fields, and `AgentRequest` / `AgentStatus` are unaffected |
| 0.26 | The skill identity is the skills.sh-style slug: the install id is `owner/repo/slug` (the legacy `owner/repo@<skill>` form is rejected), `add`/`remove`/`disable`/`enable` all match on the slugified frontmatter `name`, and the on-disk directory keeps the source repository's original directory name. `remove` / `disable` / `enable` share one `SelectionRequest` / `SelectionOutcome` pair (per-verb request/outcome types gone; `removed` / `enabled` / `disabled` → `applied`). `ListedSkill` regained `display_name` and `path`; `Manager::skill_dir` returns the scanned path. `Manager::new` / `ManagerBuilder::build` return `Result` (home resolution no longer silently falls back) | The install source becomes the id `owner/repo/slug` (the store's slug rides as the last segment); `remove_skills` / `set_skills_enabled` build `SelectionRequest` and return `outcome.applied`; `manager()` propagates construction errors |
| 0.28 | Internal updates, updated dependency tree, fully compatible with 0.26 API | No breaking changes — compiles seamlessly with current Tauri backend commands |

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
let manager = Manager::new();   // resolves the real home / config / cwd; Result since 0.26
let manager = Manager::builder().home(p).config(c).cwd(w).build(); // sandboxed; Result
```

## API surface in use

| Feature (Tauri command) | `Manager` method | Request type | Return type |
| --- | --- | --- | --- |
| Install / preview skills | `add` | `AddRequest` | `AddOutcome` |
| List installed skills | `list` | — (no arguments) | `Vec<ListedSkill>` |
| Uninstall skills | `remove` | `SelectionRequest` | `SelectionOutcome` |
| Disable skills | `disable` | `SelectionRequest` | `SelectionOutcome` |
| Enable skills | `enable` | `SelectionRequest` | `SelectionOutcome` |
| Link / unlink agents | `agent` | `AgentRequest` | `AgentOutcome` |
| Query agent link status | `agent_status` | — (no arguments) | `Vec<AgentStatus>` |

## Command-to-request mapping

| Tauri command | Request construction (`skills.rs`) |
| --- | --- |
| `install_skill` | `AddRequest::new(source)` — `source` is the id `owner/repo/slug` |
| `list_installed_skills` | `manager.list()` |
| `remove_skills` | `SelectionRequest { skills, all: false }` |
| `set_skills_enabled` | `SelectionRequest { skills, all: false }` to `enable` / `disable` |
| `link_agents` | `AgentRequest { agents, unlink }` |
| `link_status` | `manager.agent_status()` |

## Consumed return fields

- **`AddOutcome`**: the app reads `source.slug` (the id's last segment — the
  slug, the single identity `remove` / `disable` / `enable` select by;
  `skill.name` is the frontmatter `name` as declared, which the slug may fold
  differently) and
  `skipped` (nothing was copied because the same slug is already installed,
  enabled or parked). A failed install never reaches a DTO: `add` returns
  `Err`, which becomes the command's `Err` and the frontend's rejection, the
  library's message riding along as the reason the reader sees.
- **`ListedSkill`**: `name` (the slug), `display_name` (the frontmatter
  `name` as declared — the display-only rendition the UI shows when it folds
  differently than the slug), `description` (single line — the library folds
  block scalars itself), `enabled`, `installed_at`
  (`Option<u64>`, Unix seconds; `None` on filesystems that record no creation
  time). The app passes all five straight through as its `ListedSkillDto` —
  nothing is extracted locally any more. (`path` existed until 0.19 and
  returned in 0.26 together with `display_name`; since 0.20 a directory is
  resolved with `Manager::skill_dir`. `estimated_tokens` existed between 0.18
  and 0.19 only.)
- **`AgentOutcome`**: `results: Vec<AgentLinkResult>`; each `AgentLinkResult`
  carries `agent`, `display`, and `outcome: LinkOutcome`.
- **`AgentStatus`**: `name`, `display`, `linked`, `canonical`,
  `internal_skills`, `internal_others`. For unlinked, non-canonical agents the
  library classifies the agent dir's private content — skills that a link
  would adopt (`internal_skills`) and non-skill entries that would be
  quarantined (`internal_others`). The app does not scan agent dirs itself.
- **`SelectionOutcome`** (from `remove` / `disable` / `enable`): the app
  returns the names the command actually applied to (`applied`) and discards
  the rest — `available`, `requested`, `already`, `missing` describe
  no-argument / idempotent calls the frontend never makes.

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
