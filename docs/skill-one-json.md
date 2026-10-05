# Skill One Configuration & Ledger Specification

This document defines the schema, location, and architecture of `.skill-one.json`, along with an overview of all configuration and state storage across the Skill One application.

中文版：[skill-one-json.zh-CN.md](./skill-one-json.zh-CN.md)

---

## 1. Overview: The `.skill-one.json` File

`~/.agents/skills/.skill-one.json` is the local provenance ledger and metadata manifest maintained by Skill One. It restores and enriches the association between locally installed skills and their upstream store/repository entries, while recording user-defined taxonomy.

### Key Goals
1. **Strictly distinguish store installs vs third-party installs**: Even if a third-party skill is linked to an upstream repository, its origin is preserved.
2. **Standard structured JSON**: Replaces the historical line-based JSONL format with clean, human-readable, 2-space indented JSON.
3. **Zero redundant caches**: Removes bloated persisted candidates and similarity digests. Runtime searches against the registry snapshot in memory.
4. **Co-located tags**: Directly binds tag assignments to skill entries instead of maintaining detached relation lines.

---

## 2. JSON Schema Specification

```json
{
  "version": 1,
  "skills": {
    "pdf": {
      "origin": "store",
      "repo": "anthropics/skills",
      "tags": ["Document", "Office"]
    },
    "my-script": {
      "origin": "local",
      "tags": ["Custom Tool"]
    },
    "find-skills": {
      "origin": "local",
      "repo": "vercel-labs/skills",
      "tags": ["Dev Tools", "Search", "Favorite"]
    }
  },
  "customTags": [
    {
      "key": "frontend",
      "label": "💻 Frontend"
    },
    {
      "key": "favorite",
      "label": "Favorite"
    }
  ]
}
```

### Field Definitions

#### Root Object
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `version` | `number` | Yes | Schema version (currently `1`). |
| `skills` | `Record<string, SkillEntry>` | Yes | Map of installed skills keyed by local directory name (slug). |
| `customTags` | `CustomTagDef[]` | No | User-created custom taxonomy definitions. |

#### `SkillEntry`
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `origin` | `"store" \| "local"` | Yes | **Installation origin**. `"store"` = installed via Skill One store; `"local"` = external / manual copy. |
| `repo` | `string` | Optional | Associated GitHub repository (`owner/repo`). Required for `store`, optional for `local`. An empty string `""` explicitly marks the skill as unlinked, suppressing source recommendations. |
| `tags` | `string[]` | Optional | Array of tags assigned to this skill. Automatically populated from upstream on store install / source link. Users can freely add or remove tags. |

#### `CustomTagDef`
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Yes | Unique identifier for the custom tag. |
| `label` | `string` | Yes | User display label. The first character (text or emoji) is rendered as the tag avatar. |

---

## 3. Storage Location & Analysis

### Where does it live?
```
~/.agents/skills/.skill-one.json
```

### Is this location reasonable?
**Yes, it is the optimal location for skill metadata.**
* **Asset Co-location (Sidecar Pattern)**: The file describes the contents of `~/.agents/skills/`. Storing it adjacent to the skill folders ensures metadata travels with the skills if the directory is backed up, migrated, or tested in isolated environments.
* **Non-intrusive**: As a dotfile (`.skill-one.json`) lacking a `SKILL.md`, CLI tools like `agents-skills` ignore it during directory scans.
* **Option to hoist**: If keeping `~/.agents/skills/` 100% strictly containing skill folders is preferred, hoisting by one directory to `~/.agents/.skill-one.json` is also clean. However, `~/.agents/skills/.skill-one.json` is currently the most isolated and self-contained location.

---

## 4. Other Configuration & State in the Project

The application intentionally separates storage based on lifecycle and responsibility:

| File / Location | Responsibility | Storage Mechanism | Lifecycle |
| :--- | :--- | :--- | :--- |
| **`~/.agents/skills/.skill-one.json`** | Skill provenance, origin (`store`/`local`), repository links, tags | Local file (JSON, atomic write via temp file + rename) | Bound to the local skills directory. Survives app reinstalls. |
| **`<app_log_dir>/activity.jsonl`<br>*(macOS: `~/Library/Logs/com.skill-one.app/`)* | Audit event stream (installs, uninstalls, links) | Append-only JSONL with 2MB file rotation | System-managed log directory. Cleaned up according to OS policies. |
| **Webview `localStorage`** | UI preferences (Language `zh`/`en`, sort modes, unit modes, custom CDN, agent auto-link settings) | Browser / Webview LocalStorage | Per-client UI preferences. Resetting client does not affect skills data. |

### Should all configuration files be placed together?
**No. Merging them into a single folder or file would violate separation of concerns:**
1. **Asset ledger vs UI preferences**: The skill provenance ledger represents persistent user data assets. UI preferences (e.g. card vs list view, Chinese vs English toggle) are ephemeral client preferences.
2. **Log isolation**: Audit logs are high-frequency append-only streams requiring log rotation. Mixing logs with structured configuration files degrades performance and introduces file-lock / corruption risks.
3. **Platform standards**: Operating systems expect logs in `~/Library/Logs` and app data in respective standard folders, while tools adhering to the Agent standard manage code under `~/.agents/`.

---

## 5. Migration Strategy

When upgrading from the legacy `.skill-one.jsonl` to `.skill-one.json`:
1. On startup, check for legacy `.skill-one.jsonl`.
2. Map existing lines:
   - `kind: "source"` with `via: "install"` $\rightarrow$ `origin: "store"`.
   - `kind: "source"` with `via !== "install"` $\rightarrow$ `origin: "local"`.
   - `kind: "skill-tag"` $\rightarrow$ merged directly into corresponding `skills[name].tag`.
   - `kind: "pending"` with `repos` $\rightarrow$ mapped to `dismissedRepos`.
   - Temporary candidates and similarity digests are discarded.
3. Atomically write the new `.skill-one.json` and remove the legacy `.skill-one.jsonl`.
