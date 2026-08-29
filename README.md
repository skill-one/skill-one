# skillone

[English](README.md) | [简体中文](README.zh-CN.md)

A desktop app for finding, installing, and managing agent skills. Built on Tauri v2 with a React + shadcn/ui frontend; the Rust backend (the `agents-skills` library) provides skill installation and agent-linking capabilities.

> Maintained by the **skill-one** organization: <https://github.com/skill-one>

## Features

- **Store / Explore**: Browse the skills registry, view each skill's description (`SKILL.md`), and install with one click.
- **My Skills**: View, update, and uninstall installed skills.
- **Agent Linking**: Link the skill directories of various agents (Claude Code, Cursor, Gemini CLI, etc.) to a unified directory, with support for migrating existing skills.
- **Settings**: Configure the download source for registry files (direct GitHub or a CDN mirror).

## Installation

### Homebrew (macOS, Apple Silicon)

```bash
brew install --cask skill-one/tap/skillone
```

To update:

```bash
brew update && brew upgrade --cask skillone
```

Whenever a new version is released (a `v*` tag is pushed), GitHub Actions automatically builds the `.dmg` and publishes the cask to the [`skill-one/homebrew-tap`](https://github.com/skill-one/homebrew-tap) tap repository.

### Manual download

Download the installer for your platform (`.dmg` / `.msi`) from the [Releases](https://github.com/skill-one/skillone/releases) page.

## Usage

After launching the app, use the left sidebar to switch between the following pages:

1. **Store / Explore**: Browse and install skills.
2. **My Skills**: Update or uninstall installed skills.
3. **Agent Linking**: Manage skill-directory links and migration for each agent.
4. **Settings**: Switch the registry download source (direct GitHub or a CDN mirror).

## Development

For developer-facing build, architecture, and testing docs, see [docs/development.md](docs/development.md).
