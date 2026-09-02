# Skill One

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

Grab the latest `.dmg` from the [Releases](https://github.com/skill-one/skill-one/releases) page (currently macOS on Apple Silicon), then:

1. Open the `.dmg` and drag **Skill One** into your **Applications** folder.
2. Launch it — see the [macOS first-launch note](#macos-first-launch) for the one-time Gatekeeper step.

From v0.2.0 onwards you never need to download again: new versions arrive through the built-in updater. (Installs of earlier versions have no updater, so they need this one manual reinstall.)

### Homebrew (one command)

```bash
brew install --cask skill-one/tap/skill-one
```

Brew users can keep updating with `brew upgrade --cask skill-one`; brew downloads carry no quarantine attribute, so Gatekeeper never prompts.

## Staying up to date

The app checks for updates at startup and offers **Update now** when a newer version exists — it downloads, installs, and relaunches. You can also check manually: **Settings → Software Update → Check for updates**. Update packages are signature-verified before installation; a package with an invalid signature is never installed.

Homebrew users should keep using `brew upgrade --cask skill-one`.

## macOS first launch

The app is ad-hoc signed, so a manually downloaded `.dmg` may be blocked by Gatekeeper on first launch. Clear it once, using any of these:

- Right-click (or Control-click) the app → **Open** → **Open** in the dialog;
- **System Settings → Privacy & Security** → **Open Anyway** next to the blocked-app notice;
- Run `xattr -d com.apple.quarantine "/Applications/Skill One.app"` in Terminal.

After that the app opens normally, and later in-app updates never prompt again. Homebrew installs skip this entirely.

## Usage

After launching the app, use the left sidebar to switch between the following pages:

1. **Store / Explore**: Browse and install skills.
2. **My Skills**: Update or uninstall installed skills.
3. **Agent Linking**: Manage skill-directory links and migration for each agent.
4. **Settings**: Switch the registry download source (direct GitHub or a CDN mirror), and check for app updates.

## Development

For developer-facing build, architecture, and testing docs, see [docs/development.md](docs/development.md). The updater pipeline is documented in [docs/auto-update.md](docs/auto-update.md).
