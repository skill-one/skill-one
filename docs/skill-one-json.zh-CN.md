# Skill One 配置与账本规范

本文档详细定义了 `.skill-one.json` 的格式标准、存储位置与架构设计，并对 Skill One 项目中所有配置文件与数据存储的职能分工进行了全面梳理。

English version: [skill-one-json.md](./skill-one-json.md)

---

## 一、概述：`.skill-one.json` 是什么？

`~/.agents/skills/.skill-one.json` 是由 Skill One 维护的**本地技能溯源账本与元数据清单（Provenance Ledger & Manifest）**。其核心作用是在上游 `agents-skills` 不再维护全局 lockfile 的背景下，恢复并记录本地技能与线上商店仓库的映射关系，同时持久化存储用户的自定义标签分类。

### 核心设计目标
1. **严格区分商店安装与第三方安装**：即使第三方安装的技能关联了 GitHub 仓库，其 `origin` 依然忠实记录为 `local`，UI 和逻辑永远不会混淆。
2. **采用标准结构化 JSON**：彻底淘汰过去的行式 `JSONL` 格式，采用人类可读、2 空格缩进的标准 JSON。
3. **零冗余磁盘缓存**：移除磁盘中体积庞大的候选描述和哈希摘要缓存，运行时的相似度与同名匹配直接在内存及 Worker 中基于注册表快照毫秒级完成。
4. **属性就近归位**：将分类标签（`tag`）直接归属在对应的技能条目下，消除跨记录拼装的复杂性。

---

## 二、JSON 结构规范（Schema）

```json
{
  "version": 1,
  "skills": {
    "pdf": {
      "origin": "store",
      "repo": "anthropics/skills",
      "tags": ["文档处理", "办公"]
    },
    "my-script": {
      "origin": "local",
      "tags": ["自建工具"]
    },
    "find-skills": {
      "origin": "local",
      "repo": "vercel-labs/skills",
      "tags": ["开发工具", "搜索", "常用"]
    }
  },
  "customTags": [
    {
      "key": "frontend",
      "label": "💻 前端开发"
    },
    {
      "key": "common",
      "label": "常用"
    }
  ]
}
```

### 字段详细说明

#### 根对象（Root）
| 字段 | 类型 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `version` | `number` | 是 | 数据结构版本号（当前为 `1`）。 |
| `skills` | `Record<string, SkillEntry>` | 是 | 已安装技能映射表，键名为技能文件夹名（Slug）。 |
| `customTags` | `CustomTagDef[]` | 否 | 用户自建的分类标签定义池。 |

#### `SkillEntry`（单个技能条目）
| 字段 | 类型 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `origin` | `"store" \| "local"` | 是 | **安装来源（出生证明）**。`"store"` 为商店安装，`"local"` 为第三方导入或手动拷贝。 |
| `repo` | `string` | 条件必填 | 关联的 GitHub 仓库（`owner/repo`）。`store` 时必选，`local` 关联时可选。 |
| `tags` | `string[]` | 否 | 该技能分配的标签数组。商店安装或关联来源时自动填入商店官方分类，用户可自由增删自定义标签。 |

#### `CustomTagDef`（自定义标签定义）
| 字段 | 类型 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `key` | `string` | 是 | 标签唯一标识键。 |
| `label` | `string` | 是 | 界面展示名称。渲染时取首个字符（文字或 Emoji）作为图标头像。 |

---

## 三、文件存放位置分析：合理性与边界

### 当前路径
```
~/.agents/skills/.skill-one.json
```

### 这个位置合理吗？
**合理，且是技能资产清单的最佳实践位置。**
* **伴生模式（Sidecar Pattern）**：该文件的本质是 `~/.agents/skills/` 目录下全部文件夹的“元数据清单”。与目标技能文件夹物理就近存放，使得用户在多台机器间备份、同步 `~/.agents/skills` 目录时，所有技能的来源关系、分类标签不会丢失。
* **零侵入性**：由于以 `.` 开头且内部没有 `SKILL.md`，底层的 `agents-skills` 等 CLI 工具在扫描技能时会完全忽略该文件，绝不会将其误识别为技能。
* **备选方案探讨**：若希望保持 `skills/` 子目录绝对纯粹（仅包含技能子文件夹），亦可考虑将其向上移动一级至 `~/.agents/.skill-one.json`。但就隔离性而言，放在当前位置最为紧凑。

---

## 四、项目中其他配置文件与状态存储梳理

Skill One 项目根据**数据生命周期与职能**，严格实施了关注点分离，各类数据分存不同位置：

| 存储文件 / 路径 | 职能定义 | 存储与写入方式 | 生命周期与清理规则 |
| :--- | :--- | :--- | :--- |
| **`~/.agents/skills/.skill-one.json`** | 技能来源账本、来源分类（`store`/`local`）、仓库关联、标签体系 | 本地 JSON 文件（临时文件写入 + 原子 Rename 替换） | 紧随本地技能资产。应用卸载重装不会丢失。 |
| **`<app_log_dir>/activity.jsonl`<br>*(macOS: `~/Library/Logs/com.skill-one.app/`)* | 操作审计日志（安装、卸载、禁用、关联的流水事件） | 仅追加（Append-Only）JSONL，超 2MB 自动切片备份 | 操作系统托管的系统日志目录。跟随系统清理策略。 |
| **Webview `localStorage`** | 客户端 UI 偏好（语言 `zh`/`en`、排序模式、视图形态、自定义 CDN、Agent 自动联动设置） | 浏览器 / Webview 本地存储 | 属于前端视窗偏好。重置客户端不影响技能资产。 |

### 是否应该将所有配置文件统一放在一起？
**不应该全部混放在一起。原因如下：**
1. **数据资产 vs 界面偏好隔离**：
   - 技能账本属于**用户的数据资产（Asset Ledger）**，需要跨应用重装保留；
   - 而语言、卡片/列表视图、弹窗折叠状态等属于**临时视窗偏好（View Preferences）**。如果混在一个文件里，用户重置界面或清理缓存就会意外导致技能元数据丢失。
2. **流水日志的高频特性隔离**：
   - 活动日志（`activity.jsonl`）属于高频追加的事件流，需要进行文件大小限制和切片轮转（Log Rotation）；
   - 如果把日志塞进配置 JSON，每次操作都会导致整盘重写一个巨大的混合文件，容易引发 I/O 阻塞或文件损坏。
3. **符合各操作系统规范**：
   - 日志放在 `Library/Logs`；
   - Agent 资产与元数据收敛于 `~/.agents/`；
   - 视窗渲染引擎自管 `localStorage`。各司其职，结构极其清晰。

---

## 五、平滑迁移方案（Migration）

从旧版 `.skill-one.jsonl` 平滑升级到 `.skill-one.json` 的策略：
1. 启动时检查是否存在旧版 `.skill-one.jsonl`。
2. 若存在，按行提取并映射为新结构：
   - `kind: "source"` 且 `via: "install"` $\rightarrow$ 映射为 `origin: "store"`。
   - `kind: "source"` 且 `via !== "install"` $\rightarrow$ 映射为 `origin: "local"`。
   - `kind: "skill-tag"` $\rightarrow$ 直接写入对应技能条目的 `tag` 字段。
   - `kind: "pending"` 中的 `repos` $\rightarrow$ 提取为 `dismissedRepos`；其余候选描述缓存直接安全丢弃。
3. 原子写入全新的 `.skill-one.json`，并安全移除旧版 `.skill-one.jsonl`。
