# Activity Log

[English](activity-log.md) | [简体中文](activity-log.zh-CN.md)

An append-only record of the impactful operations the app performs on the
user's skills and agents: what changed, and why.

## Problem

The app acts on the user's machine — it installs, removes, enables and edits
skills, links agent directories, and associates skills with their store
source. Some of that happens without the user pressing anything (an automatic
agent link, a content-hash auto-association, a re-scan picking up a skill
someone added by hand). The provenance ledger
(`docs/skill-provenance.md`) answers *where does each skill come from now*,
but nothing answers *what happened*. The activity log is that record.

## What is recorded

One line per action, and only actions with a real effect. A read (`list`,
`read SKILL.md`, `link_status`) and a background refresh (registry snapshot,
update check) are never recorded; neither is an outcome that changed nothing
(an `alreadyLinked` agent, a skipped install).

| `event` | `actor` | `target` | `detail` |
| --- | --- | --- | --- |
| `skill.install` | `user` | skill | `{ repo, skipped }` |
| `skill.remove` | `user` | skill(s) | `{ count }` |
| `skill.enable` / `skill.disable` | `user` | skill(s) | `{ count }` |
| `skill.edit` | `user` | skill | `{}` |
| `skill.discover` | `scan` | skill | `{ origin: "store" \| "external" }` |
| `agent.link` | `auto` / `user` | agent | `{ status, adopted, quarantined, conflicts }` |
| `agent.unlink` | `user` | agent | `{ status }` |
| `source.link` | `auto` / `user` | skill | `{ repo, reason }` |

- **`actor`** carries the *reason* the user asked for: `user` for a deliberate
  action, `auto` for an automatic pass (the auto-link scan, the hash/description
  association tiers), `scan` for the discovery pass.
- **`source.link.reason`** is one of `install`, `hash`, `description`,
  `confirm` — how the association was decided.
- The auto-link pass and the manual one are distinguished with no extra
  plumbing: `linkAllAgents` is the automatic entry point, `linkAgent` the
  manual one.

### Discovery without noise

A scan runs whenever the installed list loads, so recording every scan would
flood the log. Instead, only skills that are *new* are reported. The set of
already-accounted-for names is persisted (`skill-one.activity.seen`), and the
very first pass adopts the current installed set as a **baseline** without
logging anything — a fresh install of the app must not report every
pre-existing skill as newly discovered. A store install already logs
`skill.install`, so it is never double-counted.

## Storage

```
<app_log_dir>/activity.jsonl        # macOS: ~/Library/Logs/com.skill-one.app/
<app_log_dir>/activity.jsonl.1      # the single rotated backup
```

The OS log directory (not the skills directory the provenance ledger lives in)
because this is app-produced history rather than skill state. JSONL because
this is an event stream: every line is self-describing, order matters, and
nothing is ever overwritten.

Each line is one record:

```jsonc
{"ts":"2026-09-28T08:00:00.000Z","event":"agent.link","actor":"auto",
 "target":{"kind":"agent","names":["cursor"]},
 "detail":{"status":"linked","adopted":3,"quarantined":1,"conflicts":0},
 "result":"ok"}
```

`result` is `ok` or `failed`; a failure carries an `error` string. The file
rotates at 2 MiB: the active log is moved to `activity.jsonl.1` (replacing any
older backup) and a fresh file starts. The viewer reads the newest 500 records
across both files.

## Backend surface

`src-tauri/src/activity.rs` stays thin — resolve the path, append, tail-read,
rotate, clear, open. There is no schema knowledge in Rust; parsing, the
tolerance policy and the discovery baseline all live in the frontend.

| Command | Behavior |
| --- | --- |
| `append_activity` | Append one JSON line, creating the directory and rotating first when the cap is reached |
| `read_activity` | The newest `limit` lines (default 500), oldest-first, across the active log and its backup |
| `clear_activity` | Delete the log and its backup |
| `open_activity_dir` | Reveal the directory in the system file manager |

All resolve `<app_log_dir>` internally (`AppHandle::path`); no caller-controlled
path is accepted.

## Frontend

- **`src/lib/activity.ts`**: the schema (`ActivityRecord`), `logActivity`,
  `readActivity`, line-tolerant parsing, the discovery baseline
  (`logSkillDiscoveries`), and the browser stand-in (a bounded localStorage
  ring buffer, so the dev server and tests stay fully explorable without the
  native side).
- **Recording is best-effort**: a write failure is swallowed, exactly like the
  provenance ledger, so it can never fail (or slow down) the operation it
  documents. Tolerance is per line — a broken line is skipped, the rest
  survives.
- **Instrumentation** happens at the semantic boundary, where the reason is
  known: `src/lib/local-skills.ts` records install / remove / enable / disable /
  link / unlink / edit; `src/lib/provenance.ts` records the association with its
  `reason`; `src/hooks/use-skill-provenance.ts` records discoveries after each
  reconcile.

## Display

The viewer is a dialog reached from the settings popover (`活动日志`), beside
the advanced settings — a lightweight flyout for the frequent toggles, a full
surface for real content, the same split the popover already uses.

- Newest first, grouped by local day (`Today` / `Yesterday` / date).
- One row per record: a tonal mark, a one-line summary (carrying a small
  `Automatic` / `Scan` label when the user did not take the action), an optional
  detail line, and a relative timestamp (`Intl.RelativeTimeFormat` — no
  dependency).
- Filters: the category chips (skills / agents / sources) and an *include
  automatic actions* switch.
- Footer: reveal the log in the file manager, or clear it (with a confirm).

The row rendering is a table in `src/lib/activity-notice.ts` — one entry per
event type, the same shape `src/lib/link-notice.ts` uses for link outcomes, so
a new event type is one entry rather than parallel switch arms.
