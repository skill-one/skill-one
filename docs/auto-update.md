# Auto-Update

The app updates itself with the official Tauri v2 updater plugin. Trust comes from a
**minisign key** — there is no Apple Developer account, no codesigning and no
notarization anywhere in the pipeline.

## Cutting a release

Pushing one annotated tag publishes the update; CI does everything else.

```bash
# 1) bump all four version fields to X.Y.Z — they must match exactly
#    package.json · src-tauri/tauri.conf.json · src-tauri/Cargo.toml · src-tauri/Cargo.lock
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): bump version to X.Y.Z"
git push origin main

# 2) tag it — pushing a v* tag triggers .github/workflows/release.yml
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

The workflow (`macos-14`, about 5 minutes) builds once, uploads three files to the GitHub
Release, then bumps the Homebrew cask:

| File | Consumed by |
| --- | --- |
| `Skill One_X.Y.Z_aarch64.dmg` | new users, Homebrew |
| `Skill One.app.tar.gz` | existing installs — the updater payload |
| `latest.json` | the in-app updater (version + signature) |

No per-release config: the app always follows the newest release.

## How it works

- **Endpoint**: `https://github.com/skill-one/skill-one/releases/latest/download/latest.json`, checked at startup.
- **Verification**: the package signature is checked against `plugins.updater.pubkey` in
  `src-tauri/tauri.conf.json`. Unsigned packages, or packages signed by another key, are
  never installed.
- **Flow**: `src/lib/update-store.ts` (state) → `UpdateDialog` (mounted globally,
  auto-opens on startup) + the settings page "Software Update" card (manual check);
  installing verifies the package, swaps the bundle and relaunches.
- **macOS**: the updater downloads the package itself, so the new bundle has no
  quarantine attribute and relaunches without a Gatekeeper prompt.

## Signing key

| Item | Value |
| --- | --- |
| Private key (local copy) | `~/.tauri/skill-one.updater.key` — **back it up**; if it is lost, no existing install can ever accept an update again |
| Public key | `~/.tauri/skill-one.updater.key.pub`, embedded in `tauri.conf.json` |
| GitHub secrets | `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty string) |
| Generate a keypair | `pnpm tauri signer generate --ci -p "" -w ~/.tauri/skill-one.updater.key` |

Building the signed bundle locally needs the same key:

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/skill-one.updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
pnpm tauri build --bundles app
```

## Worth knowing

- **v0.2.0 is the first release that carries an updater.** Builds before it contain no
  updater code, so those users must reinstall the DMG once before in-app updates start
  working.
- GitHub's `releases/latest` pointer is edge-cached — a fresh release can take a minute
  or two to become visible to clients.
- The check is issued by Rust (`reqwest`), not by the webview, so no HTTP cache is
  involved; every check is a live request.
- A packaged build must be started with `open`, not by exec'ing the binary inside it.

## Testing an update without GitHub

Serve a manifest from localhost and point a throwaway build at it
(`dangerousInsecureTransportProtocol` is required because release endpoints must be HTTPS):

```sh
pnpm tauri build --bundles app --config '{"version":"9.9.9"}'          # the "new" build
mv "src-tauri/target/release/bundle/macos/Skill One.app.tar.gz"* /tmp/upd/
# hand-write /tmp/upd/latest.json → version "9.9.9",
#   url "http://127.0.0.1:8099/Skill One.app.tar.gz", signature = contents of the .sig file
(cd /tmp/upd && python3 -m http.server 8099)

# the "old" build: same code, endpoint aimed at localhost
pnpm tauri build --bundles app --config '{"version":"0.0.1","plugins":{"updater":{"endpoints":["http://127.0.0.1:8099/latest.json"],"dangerousInsecureTransportProtocol":true}}}'
open "src-tauri/target/release/bundle/macos/Skill One.app"             # startup offers the 9.9.9 update
```

## Key rotation

Generate a new keypair, then update `plugins.updater.pubkey` **and** both GitHub secrets in
the same release. Old clients hold the old public key and will reject packages signed with
the new one — rotate before you ship updates, not after.
