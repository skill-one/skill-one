# Auto-Update

Skill One updates itself through the official **Tauri v2 updater plugin**. Trust comes from a
**minisign key**: there is no Apple Developer account, no codesigning and no notarization
anywhere in the pipeline.

## Detection & update flow

- **When it checks** — at startup and each time the window regains focus, so a long-running or
  tray-resident session still catches up. `src/lib/update-store.ts` throttles both to **at most
  one request per 8 hours** per session; the settings-page "检查更新" button bypasses the throttle
  (`force`). A failed check clears the throttle so the next trigger retries immediately.
- **Requests are live** — the check is issued by Rust (`reqwest`), not the webview, so it never
  reads an HTTP cache. It reads GitHub's `releases/latest` pointer, which is edge-cached: a fresh
  release can take a minute or two to become visible.
- **When an update is found** — no modal interrupts you. A badge appears beside **设置** in the
  sidebar (with an "安装更新" action on the settings page). Clicking either opens the confirmation
  dialog (version + release notes).
- **Installing** — on your go-ahead the app downloads the package, verifies its signature against
  `plugins.updater.pubkey` (in `tauri.conf.json`), swaps the bundle and relaunches. Unsigned
  packages, or ones signed by another key, are never installed. Dismissing the dialog leaves the
  badge as a reminder. On macOS the updater downloads the package itself, so the new bundle carries
  no quarantine attribute and relaunches without a Gatekeeper prompt.

## Cutting a release

Pushing one annotated tag publishes the update; CI (`.github/workflows/release.yml`, `macos-14`)
does everything else — builds once, uploads three files to the GitHub Release, then bumps the
Homebrew cask. No per-release config: the app always follows the newest release.

```bash
# 1) bump all four version fields to X.Y.Z — they must match exactly
#    package.json · src-tauri/tauri.conf.json · src-tauri/Cargo.toml · src-tauri/Cargo.lock
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): bump version to X.Y.Z"
git push origin main

# 2) tag it — pushing a v* tag triggers the workflow
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

| File | Consumed by |
| --- | --- |
| `Skill One_X.Y.Z_aarch64.dmg` | new users, Homebrew |
| `Skill One.app.tar.gz` | existing installs — the updater payload |
| `latest.json` | the in-app updater (version + signature) |

## Signing key

| Item | Value |
| --- | --- |
| Private key (local copy) | `~/.tauri/skill-one.updater.key` — **back it up**; if lost, no existing install can ever accept an update again |
| Public key | `~/.tauri/skill-one.updater.key.pub`, embedded in `tauri.conf.json` |
| GitHub secrets | `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty string) |
| Generate a keypair | `pnpm tauri signer generate --ci -p "" -w ~/.tauri/skill-one.updater.key` |

**Key rotation:** generate a new keypair, then update `plugins.updater.pubkey` **and** both GitHub
secrets in the same release — old clients hold the old public key and reject packages signed with
a new one, so rotate before you ship, not after.

## Notes

- A packaged build must be started with `open`, not by exec'ing the binary inside it.
- To self-test an update without GitHub, serve a `latest.json` from localhost and point a
  throwaway build at it via `pnpm tauri build --config`, overriding `plugins.updater.endpoints`
  and `dangerousInsecureTransportProtocol` (release endpoints must be HTTPS).
