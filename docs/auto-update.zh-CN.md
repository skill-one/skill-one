# 应用内自动更新

Skill One 通过 Tauri v2 官方 **updater 插件**自更新。可信性由 **minisign 密钥**保证——整条链路
不涉及 Apple 开发者账号，也没有代码签名与公证。

## 检测与更新机制

- **何时检测** —— 启动时、窗口每次重新获得焦点时，以及每小时一次的兜底（覆盖从不重新获得焦点的
  会话）。`src/lib/update-store.ts` 把三者合并节流到**每个会话最多每 8 小时一次**请求；设置页的
  「检查更新」按钮带 `force` 跳过节流。确认弹窗打开期间、以及正在安装期间都不会发起检测——此时
  一次 `available` 的状态更新会把用户正在看的弹窗直接掀掉。
- **请求卡住时** —— `check()` 带 15 秒超时。没有它，一次挂起的请求会让状态机永远停在 `checking`，
  并静默吞掉之后所有检测。
- **检查失败时** —— *后台*失败保持静默，且不会收回已经发现的更新，所以一次网络抖动不会把用户正
  要点击的角标抹掉；只有显式 `force` 的检查才在设置页报错。两种情况下重试窗口都随连续失败次数翻倍
  ——2 分钟、4 分钟……封顶 8 小时——因此离线或长期不可用的环境会退化为低频轮询，而不是每次切窗口
  都打一次注定失败的请求。
- **请求都是实时的** —— 检测由 Rust（`reqwest`）发出，不走 webview，绝不读 HTTP 缓存。它读的是
  GitHub 的 `releases/latest` 指针，该指针有边缘缓存：新 Release 可能要一分钟后才对客户端可见。
- **发现新版本时** —— 不再弹模态打断。侧栏「设置」右侧会出现一枚绿色「有新版本」徽章，占用的正是
  其它导航行放计数的那个位置；**点它就能从任意页面直接唤起确认弹窗**，不需要知道更新入口藏在设置里。
  设置页同时保留强调色提示块 + 「立即更新」按钮，作为"检查更新"的常规去处，也是「已是最新」「检查
  失败」「Homebrew 接管」这些状态的唯一落点。徽章挂在已有图标上而不是新增一行，与 VS Code（设置齿轮
  上的徽章）、Chrome（⋮ 菜单上的徽章）、Slack（工作区徽章）一致，避免同一件事在两处重复提示。
  点任意一个都会打开确认弹窗（版本号 + 更新说明）。
- **安装** —— 你确认后，应用下载更新包、按 `tauri.conf.json` 里的 `plugins.updater.pubkey` 验签、
  原地替换 bundle 并重启。未签名或由其他密钥签名的包永不被安装。关掉弹窗会保留角标作为提醒。
  macOS 上下载由 updater 自己完成，新 bundle 不带 quarantine 属性，重启时不会遇到 Gatekeeper 拦截。
  进度按服务端给出的包大小换算成百分比；若服务端没有返回 `Content-Length`，弹窗会如实说明，而不是
  把进度条钉在 0%。

## Homebrew 安装

由 cask 管理的 bundle 永不自更新。首次检测会先向 Rust 询问安装渠道
（`is_homebrew_install` → `src-tauri/src/update_channel.rs`，探测 `/opt/homebrew/Caskroom` 或
`/usr/local/Caskroom` 下的 cask 目录），命中则整体让位：设置页会说明情况并指向
`brew upgrade --cask skill-one`。对 cask 安装做自更新会让 Homebrew 记录的版本与实际不符，两个更新器
也会互相打架。从 Caskroom 拷出来的副本会回到自更新；探测失败同样退回自更新，而不是把用户困在旧版本。

## 怎么发版

推一个附注 tag 就等于发布一次更新，其余全部由 CI（`.github/workflows/release.yml`、`macos-14`）
完成——只构建一次、创建 Release 并生成更新说明、把说明写进 `latest.json`、上传三个文件、随后更新
Homebrew cask。每次发版都不用改配置：应用永远跟随最新一次 Release。

```bash
# 1) 四处版本号一起改成 X.Y.Z —— 必须完全一致
#    package.json · src-tauri/tauri.conf.json · src-tauri/Cargo.toml · src-tauri/Cargo.lock
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): bump version to X.Y.Z"
git push origin main

# 2) 打 tag —— 推送 v* tag 即触发工作流
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

| 文件 | 谁在用 |
| --- | --- |
| `Skill One_X.Y.Z_aarch64.dmg` | 新用户、Homebrew |
| `Skill One.app.tar.gz` | 已安装用户——更新包本体 |
| `latest.json` | 应用内更新器（版本号 + 签名 + 更新说明） |

## 签名密钥

| 项目 | 值 |
| --- | --- |
| 私钥（本地副本） | `~/.tauri/skill-one.updater.key` — **务必备份**；一旦丢失，已安装用户将永远无法再收到任何更新 |
| 公钥 | `~/.tauri/skill-one.updater.key.pub`，已写入 `tauri.conf.json` |
| GitHub secrets | `TAURI_SIGNING_PRIVATE_KEY`（另有 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，值为空串） |
| 生成密钥对 | `pnpm tauri signer generate --ci -p "" -w ~/.tauri/skill-one.updater.key` |

**密钥轮换：** 重新生成密钥对后，在**同一次发布**里同时更新 `plugins.updater.pubkey` 与两个 GitHub
secrets——旧客户端持有旧公钥，会拒收新密钥签名的包，所以要在开始发布更新之前轮换，而不是之后。

## 几点说明

- 打包版必须用 `open` 启动，不能直接执行 bundle 里的二进制。
- 想不依赖 GitHub 自测更新：用 localhost 提供一份 `latest.json`，再用 `pnpm tauri build --config`
  把一次性构建的 `plugins.updater.endpoints` 指过去，并加 `dangerousInsecureTransportProtocol`
  （发布版更新源必须是 HTTPS）。
