# Skill One

[English](README.md) | [简体中文](README.zh-CN.md)

Skill One is an open-source desktop application for discovering, installing, and managing AI agent skills. Built on **Tauri v2**, **React 19**, and **shadcn/ui**, powered by the [`agents-skills`](https://github.com/skill-one) native library.

> Maintained by the **skill-one** organization: <https://github.com/skill-one>

---

## Highlights

- **AI Agents Hub (Home)**: Visualizes detected AI coding agents (Claude Code, Cursor, Windsurf, Trae, Gemini CLI, etc.) with real-time linking status and one-click symlink integration.
- **Skill Store & Explore**: Fast client-side searching over extensive skills registries via CDN mirrors, featuring one-click installation and live skills.sh discovery.
- **Installed Skills Management**: Full control over local skills — enable/disable toggles, custom tagging, time-bucketing, batch operations, third-party source association, and in-place `SKILL.md` Markdown editing.
- **In-App Auto-Updates**: Seamless minisign signature-verified self-updates without manual re-downloads.
- **Audit Activity Log**: Append-only local log tracking all install, remove, link, and configuration changes.

---

## Installation

Download the latest `.dmg` from [GitHub Releases](https://github.com/skill-one/skill-one/releases) (macOS Apple Silicon):

1. Open the `.dmg` and drag **Skill One** into your **Applications** folder.
2. Launch the app. If prompted by macOS Gatekeeper on first open:
   - Right-click (or Control-click) **Skill One** → select **Open**; or
   - Go to **System Settings → Privacy & Security** → click **Open Anyway**; or
   - Run in Terminal: `xattr -d com.apple.quarantine "/Applications/Skill One.app"`

Subsequent updates are delivered automatically within the app.

---

## App Views

- **Agents (`/`)**: Topology view of all supported agents, connection ribbons, and link status.
- **Explore (`/explore`)**: Browse the global registry, filter by domains, or search in real-time.
- **Installed (`/installed`)**: Manage locally installed skills, organize tags, and bulk enable/disable.
- **Settings Menu**: Configure CDN mirror sources, inspect activity logs, or check for updates.

---

## Development

See the developer guides in [docs/](docs/):

- [Architecture & Design](docs/architecture.md)
- [Development Setup](docs/development.md)
- [Testing Architecture](docs/testing.md)
- [Skill Provenance Specification](docs/skill-provenance.md)
- [Activity Audit Log](docs/activity-log.md)
- [Auto-Update Pipeline](docs/auto-update.md)
