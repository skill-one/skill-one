# Auto-Update

The app updates itself with the official Tauri v2 updater plugin. No Apple
Developer account is involved anywhere in this pipeline: update packages are
trusted via a **minisign key**, not via Apple codesigning/notarization.

## How it works

```
GitHub Release (skill-one/skillone)
  latest.json  ── fetched by app at startup / manual check ─▶  version + signature
  skillone.app.tar.gz + .sig  ── downloaded after "update available" ─▶ minisign
                                                            verified ─▶ install ─▶ relaunch
```

- **Endpoint**: `https://github.com/skill-one/skillone/releases/latest/download/latest.json`
  (the `latest` path means no config change per release).
- **Verification**: the artifact's minisign signature is checked against the
  public key embedded in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
  A mismatched or unsigned package is never installed.
- **Frontend**: `src/lib/update-store.ts` (state) → `UpdateDialog` (global,
  auto-opens) + settings page "软件更新" card (manual check).
- **macOS note**: because the updater downloads the package itself, the new
  bundle has no quarantine attribute — auto-updated builds launch without any
  Gatekeeper prompt. (Only fresh downloads of the DMG by new users may need
  right-click → Open, which is unrelated to the updater.)

## Signing key

| Item | Value |
| --- | --- |
| Private key (local copy) | `~/.tauri/skillone.updater.key` — **back it up**; losing it breaks all future updates |
| Public key | `~/.tauri/skillone.updater.key.pub`, pasted into `tauri.conf.json` |
| GitHub secrets | `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty) |
| Generate command | `pnpm tauri signer generate --ci -p "" -w ~/.tauri/skillone.updater.key` |

## CI

`.github/workflows/release.yml` on tag push:

1. `tauri build` runs with the signing env vars; `bundle.createUpdaterArtifacts`
   makes it also emit `bundle/macos/skillone.app.tar.gz` + `.sig`.
2. A step generates `latest.json` (`darwin-aarch64` platform entry pointing at
   that release's tarball, signature inlined).
3. DMG + tar.gz + latest.json are uploaded to the GitHub Release (brew cask
   step unchanged).

Building locally without a release also needs the key:

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/skillone.updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
pnpm tauri build --bundles app
```

## Local end-to-end test (no GitHub needed)

Serve the update manifest from localhost and point a throwaway build at it:

```sh
# 1) build the "new" version and stash its artifact
pnpm tauri build --bundles app --config '{"version":"0.1.9"}'
mv src-tauri/target/release/bundle/macos/skillone.app.tar.gz* /tmp/upd/

# 2) write /tmp/upd/latest.json → version 0.1.9, url http://127.0.0.1:8099/skillone.app.tar.gz,
#    signature = contents of the .sig file; serve it
cd /tmp/upd && python3 -m http.server 8099

# 3) build the "old" version whose endpoint points at localhost, run it
pnpm tauri build --bundles app --config '{"plugins":{"updater":{"endpoints":["http://127.0.0.1:8099/latest.json"]}}}'
open src-tauri/target/release/bundle/macos/skillone.app
```

The startup check should pop the update dialog; installing verifies the
signature, swaps the bundle and relaunches into 0.1.9.

## Key rotation

Re-generate the keypair, update `plugins.updater.pubkey` + both GitHub
secrets in one release. Old clients keep the old pubkey and will reject
packages signed with the new key — rotate before shipping updates, not after.
