# 应用内自动更新

应用通过 Tauri v2 官方 updater 插件实现自更新。可信性由 **minisign 密钥**保证——整条链路
不涉及 Apple 开发者账号，也没有代码签名与公证。

## 怎么发版

推一个附注 tag 就等于发布一次更新，其余全部由 CI 完成。

```bash
# 1) 四处版本号一起改成 X.Y.Z —— 必须完全一致
#    package.json · src-tauri/tauri.conf.json · src-tauri/Cargo.toml · src-tauri/Cargo.lock
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): bump version to X.Y.Z"
git push origin main

# 2) 打 tag —— 推送 v* tag 即触发 .github/workflows/release.yml
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

workflow（`macos-14`，约 5 分钟）只构建一次，往 GitHub Release 上传三个文件，随后更新
Homebrew cask：

| 文件 | 谁在用 |
| --- | --- |
| `Skill One_X.Y.Z_aarch64.dmg` | 新用户、Homebrew |
| `Skill One.app.tar.gz` | 已安装用户——更新包本体 |
| `latest.json` | 应用内更新器（版本号 + 签名） |

每次发版都不用改配置：应用永远跟随最新一次 Release。

## 工作原理

- **更新源**：`https://github.com/skill-one/skillone/releases/latest/download/latest.json`，启动时检查。
- **校验**：更新包签名与 `src-tauri/tauri.conf.json` 里的 `plugins.updater.pubkey` 比对；
  未签名或由其他密钥签名的包永远不会被安装。
- **流程**：`src/lib/update-store.ts`（状态）→ `UpdateDialog`（全局挂载，启动时自动弹出）
  + 设置页「软件更新」卡片（手动检查）；点安装后会验签、原地替换 bundle 并重启。
- **macOS**：下载由 updater 自己完成，新 bundle 不带 quarantine 属性，重启时不会遇到
  Gatekeeper 拦截。

## 签名密钥

| 项目 | 值 |
| --- | --- |
| 私钥（本地副本） | `~/.tauri/skillone.updater.key` — **务必备份**；一旦丢失，已安装的用户将永远无法再收到任何更新 |
| 公钥 | `~/.tauri/skillone.updater.key.pub`，已写入 `tauri.conf.json` |
| GitHub secrets | `TAURI_SIGNING_PRIVATE_KEY`（另有 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，值为空串） |
| 生成密钥对 | `pnpm tauri signer generate --ci -p "" -w ~/.tauri/skillone.updater.key` |

本地构建带签名的 bundle 同样需要这把密钥：

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/skillone.updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
pnpm tauri build --bundles app
```

## 需要知道的几件事

- **v0.2.0 是第一个带更新器的版本。** 更早的构建里没有 updater 代码，这些用户必须手动
  重装一次 DMG，之后才能开始接收应用内更新。
- GitHub 的 `releases/latest` 指针有边缘缓存——新 Release 可能要一分钟后才对客户端可见。
- 检查请求由 Rust（`reqwest`）发出，不走 webview，因此不涉及 HTTP 缓存，每次都是新鲜请求。
- 打包版必须用 `open` 启动，不能直接执行 bundle 里的二进制。

## 不依赖 GitHub 的更新自测

用 localhost 提供更新清单，让一次性构建指向它（发布版更新源必须是 HTTPS，所以本地 http
自测需要 `dangerousInsecureTransportProtocol`）：

```sh
pnpm tauri build --bundles app --config '{"version":"9.9.9"}'          # 「新版本」
mv "src-tauri/target/release/bundle/macos/Skill One.app.tar.gz"* /tmp/upd/
# 手写 /tmp/upd/latest.json → version "9.9.9"、
#   url "http://127.0.0.1:8099/Skill One.app.tar.gz"、signature = .sig 文件内容
(cd /tmp/upd && python3 -m http.server 8099)

# 「旧版本」：同一份代码，只把更新源改成 localhost
pnpm tauri build --bundles app --config '{"version":"0.0.1","plugins":{"updater":{"endpoints":["http://127.0.0.1:8099/latest.json"],"dangerousInsecureTransportProtocol":true}}}'
open "src-tauri/target/release/bundle/macos/Skill One.app"             # 启动时应提示升级到 9.9.9
```

## 密钥轮换

重新生成密钥对后，请在**同一次发布**里同时更新 `plugins.updater.pubkey` 与两个 GitHub
secrets。旧客户端持有旧公钥，会拒收新密钥签名的包——要在开始发布更新之前轮换，而不是之后。
