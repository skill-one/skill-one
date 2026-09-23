# 注册表快照（skills.jsonl）

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

商店内容来自 [skill-one/skills-profiles](https://github.com/skill-one/skills-profiles)——它覆盖 [skills.sh](https://www.skills.sh) 上全部 GitHub 来源技能，并为每个技能生成分类。快照发布在 `dist` 分支：`skills.jsonl` 每行一个技能，`skills/` 目录存放每个技能的完整文件，`profiles/` 目录是该数据集自带的分类可浏览副本，`upstream/` 目录则存放镜像侧的附属文件（`stats.json`、`repos.jsonl`、`avatars/`）。

## 格式

每行一个 JSON 对象，按安装量降序排列：

```json
{
  "id": "vercel-labs/skills/find-skills",
  "installs": 3474068,
  "url": "https://www.skills.sh/vercel-labs/skills/find-skills",
  "description": "Helps users discover and install agent skills …",
  "hash": "b146008599c31057cef1c145774cea5d5afb30e8f43fa802e47a4b461419aaaf",
  "fetchedAt": "2026-09-06T07:57:37.803Z",
  "domain": "development"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | skills.sh 规范 id：`{owner}/{repo}/{slug}`。含 `/` 的多段 slug 会去掉斜杠后作为键，因此 id 恒为三段。 |
| `installs` | `number` | skills.sh 记录的总安装量 |
| `url` | `string` | 技能在 skills.sh 的页面 |
| `description` | `string \| null` | 来自 SKILL.md frontmatter（缺失时为空） |
| `hash` | `string \| null` | 技能文件的 SHA-256。上游任何文件变化都会使其改变，即**快照所描述的那个版本**。 |
| `fetchedAt` | `string` | 抓取器首次取到当前内容版本的时间（ISO，UTC）：说的是*当前内容*发布了多久，不是技能最早何时出现 |
| `domain` | `string \| string[]` | 分类，取自固定的英文枚举（`development`、`data-analysis`、…、`other`）。`dist` 快照当前把最贴合的那一个键作为裸字符串下发；该字段也曾承载 1–3 个键、最贴合的在前，因此应用两种形状都读、并统一存成列表。[data/domains.ts](../src/data/domains.ts) 负责把键映射为展示名与 emoji。生成器尚未处理到的技能不含该字段。 |

分类随索引行一起下发，因此一行解析完就是一个装饰完整的技能——不存在需要事后合并的第二数据源。一个技能可以合法地属于多个分类，这也是分组与筛选按「包含」匹配、而不是按精确值匹配的原因。

分类**缺失**是第三种状态，不等于 其他：枚举里的 `other` 是数据集给出的回答（以上都不贴合），而生成器尚未处理到的技能根本没有回答。应用把两者区分开——其他 用盒子（📦），没有回答的用问号（❓ 未分类）——筛选栏也为两者各留一个 chip，因此标着 其他 的筛选不会悄悄把「没人看过」的技能也算进去。

GitHub star 数**不在**技能行里：它存放在下文的 `upstream/repos.jsonl` 附属文件中，解析时 join 进来。

## 仓库元数据（upstream/repos.jsonl）

每行一个 JSON 对象，一个 GitHub 仓库一行，按 repo 排序：

```json
{"repo": "vercel-labs/skills", "stars": 1523, "description": "Agents, skills, and plugins for Vercel", "pushedAt": "2026-09-11T14:02:11.000Z"}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `repo` | `string` | `{owner}/{repo}`——即索引 id 的前两段，join 的连接键 |
| `stars` | `number \| null` | 仓库的 GitHub star 数；仓库已删除时为 `null`（应用内归一为 0） |
| `description` | `string \| null` | 仓库的 GitHub About 文本。应用未使用：技能描述来自 SKILL.md frontmatter。 |
| `pushedAt` | `string \| null` | 仓库最后一次 push。它跟踪的是**仓库**而非技能——技能级的变化由 `hash` / `fetchedAt` 描述。应用未使用。 |

## Owner 头像（upstream/avatars/）

数据集会把每个 owner 的 GitHub 头像复制进快照，路径固定为 `upstream/avatars/{owner}.png`（无论实际编码如何，扩展名一律为 `.png`——图片解码器会嗅探字节内容）。因此 owner 头像与 SKILL.md 走同一条下载源与 CDN 回退链，存在已记录标签时定址到该快照。GitHub 自身的头像服务（`github.com/{owner}.png`）保留在回退链末尾，兜底数据集缺失的 owner（某次运行失败会留洞，直到下次运行补上）；最后的最后是 owner 首字母占位。

## 分类文件（profiles/）

每个已分类的技能还会发布 `profiles/{id}/domain.json`——载荷与索引行里的分类完全一致——以及供人阅读的 `md/domain.md`。应用只读索引行、从不拉取这两个文件，它们作为数据集自己的可浏览副本存在。快照不再发布逐技能封面插图：详情抽屉的图片位显示作者首字母（见 [../src/components/skill-cover.tsx](../src/components/skill-cover.tsx)）。列表卡片则完全不放图片位——每张卡都重复一个首字母方块，只是 48px 不承载技能任何事实的装饰——因此每张卡由名称打头，来源则写在卡片的信息行上。

索引行与 `skills/` 目录按 id 一一对应：`skills/{owner}/{repo}/{slug}/` 内正是上游技能自带的全部文件。应用把每行映射为 `Skill` 模型：`name = slug`、`repo = {owner}/{repo}`、`path = skills/{id}`（快照内目录，用于详情拉取与按目录名匹配）、`rev = hash`、`firstSeenAt = fetchedAt`、`profile = { domain }`——`stars` 则来自 join 到的 `repos.jsonl` 行（未 join 到时为 0）。

技能详情抽屉将 `hash` 以「版本」呈现（`#b1460085`，完整值放 tooltip），`fetchedAt` 以「收录时间」呈现，分类则以分类标签呈现。作者自己在 frontmatter 写的 `version` 刻意不再并列展示：它是对另一件事的声明。

## 消费方式

实现位于 [../src/lib/registry/](../src/lib/registry/)（worker + 主线程代理），由商店各页面消费。

### `latest` 指针

版本解析是**指针优先**的：上游在 `dist` 分支根目录发布一个 `latest` 文件，里面一行文本就是该分支当前指向的标签——当天的基线（`dist-<date>`）或在其之上生成的某一批次（`dist-<date>-N`）。读这一个小文件就确定了版本——其它所有地址都由该标签拼出，因此不涉及列举标签、排序或解析标签名；而且它走用户配置的下载源，不需要一个 CDN 无法提供的 API。该请求**带打散缓存的时间戳**：一个以报告新鲜度为职责的可变指针绝不能从缓存里拿，否则旧快照会被当成当前版本。

### `upstream/stats.json` 附属文件

快照的缓存能力全靠随行的运行统计承载：

| 字段 | 作用 |
| --- | --- |
| `finishedAt` | 标识快照：一次运行只发布一次，因此相同的值意味着相同的字节——「索引变了吗」由此变成一次字符串比较。它同时作为发布时间展示在「设置」页。 |
| `indexedRows` | 发布的行数；「设置」页中与本地实际加载数并列展示（后者可能更少：解析时有防御性过滤）。 |

### 拉取策略

- 标签来自上面的 `latest` 指针，下载定址到它，即恰好就是上游发布的那个快照。
- `upstream/stats.json` 随后**定址到该标签读取**——地址不可变，因此不打散缓存——从中取得发布时间戳与行数。若读不到，仅凭标签仍可锚定正文下载（只是失去「未变化则跳过」的短路优化）。若指针本身就读不到，则走降级路径：打散缓存地探测可变 `dist` 分支上的 `stats.json` 取得时间戳，版本保持未定址。不再有任何地方从时间戳反推标签：指针就是上游对标签的正式声明，从 `finishedAt` 猜只会更差。
- 正文随后按 `dist-<date>[-N]` 标签拉取（`…/skills-profiles@dist-2026-09-20-12/skills.jsonl`）。标签对单个快照不可变，因此不打散缓存，且边缘副本必然就是正确的字节。（重跑会强制把标签移到最新快照；变化了的 `finishedAt` 会察觉这一点并触发重下。）
- 若指针与分支统计均无法解析，则退回可变的 `dist` ref——此时必须打散缓存，因为没有定址锚点时，一份一天前的边缘副本与当前索引无从分辨。
- 解析结果连同其身份（`tag` + `finishedAt`）一起持久化到 IndexedDB，同时把标签记录到 localStorage（`skill-one.indexTag`），用于锚定 SKILL.md 详情拉取并在「设置」页展示。下次启动立即用该缓存渲染，再把探测到的时间戳与存储的比较：相同则**完全跳过多 MB 的正文下载**。
- 应用只是开着不动时，该探测也会被重复：每小时检查一次是否距上次完成的校验超过 12 小时（数据集每日发布一次），窗口重新可见时（例如系统休眠吞掉了若干次 tick）也会再查一次。整个过程不向用户索要任何操作——刷新是原地替换当前快照、不闪白屏，失败或没有变化的校验也完全不提——但**确实拉到了新快照时会顺带提示一句**，免得列表在眼皮底下变化被当成故障。当前快照身份上的 `checkedAt` 就是校验时间的来源（窗口即以此为基准），且**只有真正得到应答的探测才会写入它**，因此数据源不可达时下一次 tick 会自行重试。注意：周期性校验在解析不出标签时**绝不**回退到未锚定的正文下载（启动与强制重下才会）——探测没有应答就什么都不下载，原有数据原样保留，而不是凭猜测拉取整份索引。
- [index-stream.ts](../src/lib/registry/index-stream.ts) 中的 `INDEX_SPEC` 固定 `repo` / `path: "skills.jsonl"` / `ref: "dist"`（上面的标签由每次下载注入），两个附属文件都相对它定址：`upstream/stats.json`、`upstream/repos.jsonl`。
- 解析后过滤掉非规范 GitHub id（非三段、owner 含 `.`）的行，其余映射为 `Skill` 模型。
- 下载是流式的：响应体逐行解码，每凑齐一行就立即解析，界面不必等待整份约 6.9MB 的文件。进度最多每 400ms 推送一次；某个下载源中途失败、切换到下一个候选重新解析时活动缓冲区会被清空重头解析，因此推送出的计数是单调的，永远只增不减。
- `upstream/repos.jsonl`（GitHub star 数的 join 表，见上文）同样定址到同一快照标签拉取，与正文同时启动，因此其延迟隐藏在多 MB 的索引下载之内；解析出的行在解析阶段 join 进每一行技能数据。它只是点缀：附属文件缺失或不可达时技能以 0 star 呈现，而不是让下载失败。「未变化」短路会完全跳过它——缓存里的技能早已带着各自的 star 数。join 失败的结果也绝不落缓存：只有 sidecar 真正应答过（空 map 算应答，null 不算）才写入冷启动缓存，因此本轮的 0 star 不会被带进下一轮；下次启动会重新下载并重试 join。

### 界面

- 探索页在流式下载期间渐进渲染（计数显示为「N · 加载中」），侧边栏「全部」的数字随下载推进持续增长。
- 依赖全量数据的页面——「我的技能」的元数据 join——以「下载完成」为门控，在此之前保持骨架屏，因为部分数据会解析出错误的技能。
- 「设置」页报告当前服务的快照（`dist-<date>[-N]` 标签、发布时间、发布行数），以及本次启动是重新下载还是复用了本地缓存；在线身份到来之前会回退显示已记录的标签。它还会给出上次完成的校验时间（`checkedAt`），自动刷新的窗口正是以此为基准。「检测更新」按需执行同一套廉价校验（不受新鲜度窗口限制）并报告是否拉到了新快照；「立即重新下载」则即使快照没有变化也强制重下。

技能详情 `SKILL.md` 从快照按 `skills/{id}/SKILL.md` 拉取，存在已记录标签时定址到该快照（否则用可变的 `dist` 分支），见 [../src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts)。

Owner 头像（skill 卡片元信息行上的作者头像，以及详情抽屉仓库行上的仓库所有者头像）从快照按 `upstream/avatars/{owner}.png` 拉取，走同一条下载源回退链，存在已记录标签时定址到该快照，见 [../src/components/owner-avatar.tsx](../src/components/owner-avatar.tsx)。头像本身只是装饰：详情抽屉的仓库行与卡片的信息行都会把仓库名以文本形式紧邻显示，头像自带的浮窗（见 [../src/components/repo-hover-card.tsx](../src/components/repo-hover-card.tsx)）则额外给出其 Star 数，因此头像对辅助技术隐藏。
