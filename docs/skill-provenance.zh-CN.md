# 技能溯源规范 (Skill Provenance)

[English](skill-provenance.md) | [简体中文](skill-provenance.zh-CN.md)

Skill One 在本地维护一个元数据账本文件：
```
~/.agents/skills/.skill-one.json
```

用于记录本地安装的技能与其上游商店/代码仓的对应关系，并持久化用户的自定义分类标签。

---

## 1. 数据结构规范

账本采用清晰的 JSON 格式持久化：

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

### 根对象

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `version` | `number` | 是 | 规范版本号（当前为 `1`）。 |
| `skills` | `Record<string, SkillRecord>` | 是 | 以本地技能目录名为键的技能字典。 |
| `customTags` | `CustomTagDef[]` | 否 | 用户创建的自定义分类标签定义列表。 |

### `SkillRecord`

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `origin` | `"store" \| "local"` | 是 | 安装来源：`"store"`（通过 Skill One 安装）或 `"local"`（外部工具安装或本地手动创建）。 |
| `repo` | `string` | 否 | 关联的上游代码仓（`owner/repo`）。 |
| `tags` | `string[]` | 否 | 分配给该技能的自定义标签键列表。 |
| `via` | `"install" \| "confirm" \| "description"` | 否 | 来源关联的确认方式。 |

### `CustomTagDef`

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | `string` | 是 | 标签唯一标识键。 |
| `label` | `string` | 是 | 标签显示名称。 |
| `emoji` | `string` | 否 | 标签前缀 Emoji 图标。 |

---

## 2. 存储与生命周期

1. **同构存放**：与技能目录同级存放在 `~/.agents/skills/.skill-one.json`，作为隐藏点文件避免影响常规扫描工具。
2. **原子化写入**：Rust 后端（`provenance.rs`）通过临时文件与重命名操作保证并发写入原子性。
3. **状态自动对齐**：每次应用启动或读取技能时，若磁盘上对应技能目录已移除，账本条目会自动清理。
