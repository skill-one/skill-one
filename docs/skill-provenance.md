# Skill Provenance Specification

[English](skill-provenance.md) | [简体中文](skill-provenance.zh-CN.md)

Skill One maintains a local metadata manifest and provenance ledger at:
```
~/.agents/skills/.skill-one.json
```

It associates locally installed skills with their upstream store/repository origins and records user-defined taxonomy.

---

## 1. Schema Specification

The ledger is formatted as human-readable JSON:

```json
{
  "version": 1,
  "skills": {
    "pdf": {
      "origin": "store",
      "repo": "anthropics/skills",
      "tags": ["document", "office"]
    },
    "my-script": {
      "origin": "local",
      "tags": ["utility"]
    },
    "find-skills": {
      "origin": "local",
      "repo": "vercel-labs/skills",
      "tags": ["devtools"]
    }
  },
  "customTags": [
    {
      "key": "frontend",
      "label": "Frontend",
      "emoji": "💻"
    }
  ]
}
```

### Root Object

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `version` | `number` | Yes | Schema version (currently `1`). |
| `skills` | `Record<string, SkillRecord>` | Yes | Installed skills keyed by directory slug. |
| `customTags` | `CustomTagDef[]` | No | User-created custom taxonomy definitions. |

### `SkillRecord`

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `origin` | `"store" \| "local"` | Yes | Installation source: `"store"` (installed via Skill One) or `"local"` (external/manual copy). |
| `repo` | `string` | Optional | Upstream repository (`owner/repo`). |
| `tags` | `string[]` | Optional | Custom tag keys assigned to the skill. |
| `via` | `"install" \| "confirm" \| "description"` | Optional | How the repository link was established. |

### `CustomTagDef`

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Yes | Unique tag identifier slug. |
| `label` | `string` | Yes | Display label. |
| `emoji` | `string` | Optional | Emoji glyph prefix. |

---

## 2. Storage & Lifecycle

1. **Location**: Co-located adjacent to skills in `~/.agents/skills/.skill-one.json`. Ignored by CLI scanners as a hidden dotfile.
2. **Atomic Writes**: Saved atomically via temporary sibling files and rename operations in Rust (`provenance.rs`).
3. **Reconciliation**: On startup, entries for skills no longer present on disk are pruned automatically.
