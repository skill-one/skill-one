# skillone

[English](README.md) | [简体中文](README.zh-CN.md)

A desktop app for finding, installing, and managing agent skills. Built on Tauri v2 with a React + shadcn/ui frontend; the Rust backend (the `agents-skills` library) provides skill installation and agent-linking capabilities.

> Maintained by the **skill-one** organization: <https://github.com/skill-one>

## Features

- **Store / Explore**: Browse the skills registry, view each skill's description (`SKILL.md`), and install with one click.
- **My Skills**: View, update, and uninstall installed skills.
- **Agent Linking**: Link the skill directories of various agents (Claude Code, Cursor, Gemini CLI, etc.) to a unified directory, with support for migrating existing skills.
- **Auto-Update**: The app checks for new releases at startup and installs signed updates in one click — no re-downloading, and no Apple Developer account involved (updates are verified with a minisign key).
- **Settings**: Configure the download source for registry files (direct GitHub or a CDN mirror).

## Installation

### Download from Releases (recommended)

Grab the latest `.dmg` from the [Releases](https://github.com/skill-one/skillone/releases) page (currently macOS on Apple Silicon), then:

1. Open the `.dmg` and drag **skillone** into your **Applications** folder.
2. Launch it — see the [macOS first-launch note](#macos-first-launch) for the one-time Gatekeeper step.

From v0.2.0 onwards you never need to download again: new versions arrive through the built-in updater. (Installs of earlier versions have no updater, so they need this one manual reinstall.)

### Homebrew (one command)

```bash
brew install --cask skill-one/tap/skillone
```

Brew users can keep updating with `brew upgrade --cask skillone`; brew downloads carry no quarantine attribute, so Gatekeeper never prompts.

## Staying up to date

skillone ships updates through GitHub Releases and its **in-app updater**:

- On startup, the app silently checks for the latest release. When a newer version exists, a dialog offers **Update now** with download progress; the app relaunches into the new version when done.
- You can also check manually any time: **Settings → Software Update → Check for updates**.
- Every update package is cryptographically **signed and verified** before installation; a tampered or unsigned package is never installed. (Cutting a `v*` tag is all it takes — CI builds, signs, and publishes the update automatically.)

Updates installed in-app are not blocked by Gatekeeper (the app performs the swap itself). If you installed via Homebrew, prefer `brew upgrade --cask skillone` to keep brew's records in sync.

### macOS first launch

This app is distributed ad-hoc signed (no paid Apple Developer ID), so on a **fresh manual download** macOS may say *"skillone cannot be opened because the developer cannot be verified"* (on macOS 15+, right-click may even report *"cannot be opened"*). One-time workaround, either of:

- **Right-click (or Control-click) the app → Open → Open** in the dialog; or
- **System Settings → Privacy & Security** → scroll to the blocked-app notice → **Open Anyway**.

After this single approval the app opens normally forever — and later updates delivered by the in-app updater never ask again. (Homebrew installs skip this entirely.)

## Usage

After launching the app, use the left sidebar to switch between the following pages:

1. **Store / Explore**: Browse and install skills.
2. **My Skills**: Update or uninstall installed skills.
3. **Agent Linking**: Manage skill-directory links and migration for each agent.
4. **Settings**: Switch the registry download source (direct GitHub or a CDN mirror), and check for app updates.

## Development

For developer-facing build, architecture, and testing docs, see [docs/development.md](docs/development.md). The updater pipeline is documented in [docs/auto-update.md](docs/auto-update.md).
