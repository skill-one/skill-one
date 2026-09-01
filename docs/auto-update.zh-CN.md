# 应用内自动更新

应用通过 Tauri v2 官方 updater 插件实现自更新。整条链路都不需要 Apple
开发者账号：更新包的可信性由 **minisign 密钥**保证，与 Apple
代码签名/公证无关。

## 工作原理

```
GitHub Release (skill-one/skillone)
  latest.json  ── 应用启动时 / 手动检查时拉取 ─▶  版本号 + 签名
  skillone.app.tar.gz + .sig  ── 发现新版本后下载 ─▶ minisign
                                        验签通过 ─▶ 安装 ─▶ 重启
```

- **更新源**：`https://github.com/skill-one/skillone/releases/latest/download/latest.json`
  （固定 `latest` 路径，发新版本无需改任何配置）。
- **校验**：下载包的 minisign 签名与 `src-tauri/tauri.conf.json` 里的公钥
  （`plugins.updater.pubkey`）比对；签名不符的包永远不会被安装。
- **前端**：`src/lib/update-store.ts`（状态）→ `UpdateDialog`（全局挂载，
  自动弹出）+ 设置页「软件更新」卡片（手动检查）。
- **macOS 说明**：下载由 updater 自己完成，新 bundle 不带 quarantine
  属性——自动更新后的启动不会遇到 Gatekeeper 拦截。（仅新用户首次从 DMG
  手动安装时可能需右键「打开」，与更新器无关。）

## 签名密钥

| 项目 | 值 |
| --- | --- |
| 私钥（本地） | `~/.tauri/skillone.updater.key` — **务必备份**；丢失即无法再发布更新 |
| 公钥 | `~/.tauri/skillone.updater.key.pub`，已写入 `tauri.conf.json` |
| GitHub secrets | `TAURI_SIGNING_PRIVATE_KEY`（另有 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，为空串） |
| 生成命令 | `pnpm tauri signer generate --ci -p "" -w ~/.tauri/skillone.updater.key` |

## CI

`.github/workflows/release.yml`（打 tag 触发）：

1. `tauri build` 注入签名环境变量；`bundle.createUpdaterArtifacts` 使其额外
   产出 `bundle/macos/skillone.app.tar.gz` + `.sig`。
2. 一个步骤生成 `latest.json`（`darwin-aarch64` 条目指向该 Release 的
   tar.gz，内联签名）。
3. DMG + tar.gz + latest.json 一起上传到 GitHub Release（Homebrew 步骤不变）。

本地完整构建同样需要密钥：

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/skillone.updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
pnpm tauri build --bundles app
```

## 本地端到端测试（不依赖 GitHub）

用 localhost 提供更新清单，让一次性构建指向它：

```sh
# 1) 构建「新版本」并暂存其更新产物
pnpm tauri build --bundles app --config '{"version":"0.1.9"}'
mv src-tauri/target/release/bundle/macos/skillone.app.tar.gz* /tmp/upd/

# 2) 编写 /tmp/upd/latest.json → version 0.1.9，url 为
#    http://127.0.0.1:8099/skillone.app.tar.gz，signature 为 .sig 文件内容；起服务
cd /tmp/upd && python3 -m http.server 8099

# 3) 构建更新源指向 localhost 的「旧版本」并运行
pnpm tauri build --bundles app --config '{"plugins":{"updater":{"endpoints":["http://127.0.0.1:8099/latest.json"]}}}'
open src-tauri/target/release/bundle/macos/skillone.app
```

启动检查应弹出更新弹窗；点击安装后会验签、原地替换 bundle 并重启为 0.1.9。

## 密钥轮换

重新生成密钥对，在同一次发布里同时更新 `plugins.updater.pubkey` 与两个
GitHub secrets。旧客户端持有旧公钥、会拒收新密钥签名的包——请在开始发布
更新之前轮换，而不是之后。
