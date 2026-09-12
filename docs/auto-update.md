# Auto-Update

Skill One updates itself through the official **Tauri v2 updater plugin**. Trust comes from a
**minisign key**: there is no Apple Developer account, no codesigning and no notarization
anywhere in the pipeline.

## Detection & update flow

- **When it checks** — at startup, each time the window regains focus, and hourly as a fallback for
  a session that is never refocused. `src/lib/update-store.ts` collapses all three into **at most
  one request per 8 hours** per session; the settings-page "检查更新" button bypasses the throttle
  (`force`). No check runs while the confirmation dialog is open or an install is in flight — an
  `available` emit would tear the dialog away mid-decision.
- **When the request hangs** — `check()` is bounded by a 15 s timeout. Without one, a stalled
  request would pin the store in `checking` and silently swallow every later check.
- **When the check fails** — a *background* failure is silent and keeps an already-discovered update
  on screen, so a network hiccup cannot retract the badge the user was about to click. Only an
  explicit `force` check reports the error (on the settings page). Either way the retry window
  doubles per consecutive failure — 2 min, 4 min, … capped at 8 hours — so an offline or otherwise
  hopeless install settles into a slow poll instead of one doomed request per focus hop.
- **Requests are live** — the check is issued by Rust (`reqwest`), not the webview, so it never
  reads an HTTP cache. It reads GitHub's `releases/latest` pointer, which is edge-cached: a fresh
  release can take a minute or two to become visible.
- **When an update is found** — no modal interrupts you. A green **有新版本** badge appears on **设置**
  itself, in the slot the other sidebar rows use for their counts, and **clicking it opens the
  confirmation dialog from wherever the user is** — nobody has to know the update is filed under
  settings. The settings page keeps the same state as a tinted callout with an **立即更新** button:
  it is the conventional "check for updates" home, and the only place the other phases (up to date,
  check failed, Homebrew-managed) can be shown. One badge on an icon the user already knows, as in
  VS Code's gear, Chrome's ⋮ menu and Slack's workspace — one signal per fact instead of two.
- **Installing** — on your go-ahead the app downloads the package, verifies its signature against
  `plugins.updater.pubkey` (in `tauri.conf.json`), swaps the bundle and relaunches. Unsigned
  packages, or ones signed by another key, are never installed. Dismissing the dialog leaves the
  badge as a reminder. On macOS the updater downloads the package itself, so the new bundle carries
  no quarantine attribute and relaunches without a Gatekeeper prompt. Progress is a percentage of
  the reported package size; when the server sends no `Content-Length` the dialog says so instead of
  pinning a bar at 0%.

## Homebrew installs

A cask-managed bundle is never self-updated. The first check asks Rust for the install channel
(`is_homebrew_install` → `src-tauri/src/update_channel.rs`, which looks for the cask directory under
`/opt/homebrew/Caskroom` or `/usr/local/Caskroom`) and, if it finds one, stands down: the settings
page says so and points at `brew upgrade --cask skill-one`. Self-updating a cask install would leave
Homebrew recording a version it does not have, and the two updaters would fight over the bundle. A
bundle copied out of the Caskroom goes back to self-update, and a failed probe degrades to
self-update rather than stranding the user on an old version.

## Cutting a release

Pushing one annotated tag publishes the update; CI (`.github/workflows/release.yml`, `macos-14`)
does everything else — builds once, creates the GitHub Release with generated notes, bakes those
notes into `latest.json`, uploads the three files, then bumps the Homebrew cask. No per-release
config: the app always follows the newest release.

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
| `latest.json` | the in-app updater (version + signature + release notes) |

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
