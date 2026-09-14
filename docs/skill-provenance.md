# Skill Provenance Ledger

How the app associates a locally installed skill with its store entry
(`owner/repo/slug`), after `agents-skills` 0.13 dropped its lockfile and with
it the last install-source record.

中文版：[skill-provenance.zh-CN.md](./skill-provenance.zh-CN.md)

## Problem

The store index identifies every skill by its canonical id
`{owner}/{repo}/{slug}`. Locally, a skill is just a directory under
`~/.agents/skills/<name>` plus a `SKILL.md` frontmatter that carries only
`name` and `description` — nothing says where it came from. The slug is the
only shared key, so a same-named skill from a different repo could not be
distinguished from the installed one.

## Design: an app-level ledger

The app keeps its own record — the **provenance ledger** — as a single JSON
file:

```
~/.agents/skills/.skill-one.json
```

```json
{
  "version": 1,
  "skills": {
    "pdf": {
      "repo": "anthropics/skills",
      "slug": "pdf",
      "installedAt": "2026-09-13T08:00:00.000Z",
      "hash": "9a1f…"
    }
  }
}
```

The optional `hash` is the **store-side** content hash recorded when the
association was made: the registry entry's `rev` at install time (native
installs) or the matched rev (hash auto-link). It is a version marker, not a
description of the local files — the freshly installed clone tracks repo
HEAD, which can be ahead of the indexed snapshot, so a computed directory
hash would permanently disagree with the rev and poison the update signal.
A future update check simply compares the recorded hash against the latest
index rev: differ means the store published a new version since install.
Local edits are invisible to it, by design.

Key properties:

- **Written after every successful install** (`installSkillFromSource`), keyed
  by skill name. Reinstalling overwrites the entry.
- **Pruned on reconciliation.** Every time the installed list loads, entries
  whose skill no longer exists on disk are dropped, so skills removed outside
  the app stop claiming a source.
- **Cleared on uninstall.**
- **Best-effort on both ends.** Ledger failures never fail the install or
  removal they document; a missing or corrupt file degrades to an empty
  ledger (name-only matching, the pre-ledger behavior).
- **Invisible to other tools.** The file is a hidden dotfile without a
  `SKILL.md`, so the `agents-skills` directory scan ignores it entirely.

### Storage choice

The ledger lives next to the skills it describes (not in the Tauri app-data
directory), so reconciliation is a direct ledger↔disk comparison and the
association survives app reinstalls. The trade-off: moving `~/.agents`
elsewhere loses the mapping — accepted, since the skills themselves move with
it and the ledger is rebuilt by future installs.

### Backend surface

The Rust side stays thin — two fixed-path file commands, no ledger schema
knowledge (parsing, merging and pruning live in `src/lib/provenance.ts`):

| Command | Behavior |
| --- | --- |
| `read_provenance` | Raw file content; `null` when the ledger does not exist yet |
| `write_provenance` | Full-document replace, atomic (temp file + rename) |

Both resolve the path internally (`<home>/.agents/skills/.skill-one.json`);
no caller-controlled paths are accepted.

## Consumers

- **Install buttons** (`skill-install-button.tsx`): a skill on disk counts as
  "installed" for a store entry when the names match *and* the ledger entry's
  `repo` matches the store entry's (or when there is no ledger entry — unknown
  source falls back to name-only). A same-named skill from a different repo
  stays installable.
- **My-skills page** (`my-skills-page.tsx`): cards with a ledger entry show
  the source repo, carry the owner's GitHub avatar as the author chip on their
  metadata rail, and can address the skill's cover in the registry; the detail
  drawer links to the source repo instead of reading as 本地安装. Entries are
  absent for tool-installed skills, which keep the local-install presentation
  (no author chip, and the image slot falls back to the skill's own initial).

## Associating skills installed by other tools

The ledger only covers installs made through this app. Skills installed by
other tools (the `npx skills` CLI, manual copies) get associated through two
further tiers, run by the same reconcile query (`use-skill-provenance.ts`,
`lib/link-suggestions.ts`) and only when the registry snapshot is ready:

### Tier 1 — hash auto-link (certain)

The store index carries the skills.sh upstream content hash per skill:
SHA-256 over each file's `relative path + 0x00 + bytes + 0x00`, files in
case-insensitive ICU collation order (`Intl.Collator("en", {sensitivity:
"base"})` — *not* byte order, which reproduces only ~40% of hashes). The
cheap filter runs first: a skill with no same-slug registry entries is
skipped entirely — plain local skill, no disk walk. Otherwise the backend
computes the same hash for the installed skill (`compute_skill_hash`,
`skill_hash.rs`); equality with a namesake entry's `rev` is content-level
identity, so the association is written into the ledger exactly like a
native install — no user interaction, and the card immediately shows the
source repo.

Verified against the published snapshot: 51/51 sampled skills re-hashed
locally match the index. Misses are expected and handled: the mirror snapshot
may omit files the local clone has (media/binaries), `safeSegment` rewrites
exotic path characters, and the local copy may simply be a different version
than the indexed one. Misses are memoized per registry epoch so the
reconcile query never re-hashes known dead ends.

### Tier 2 — ranked candidates + user confirmation (heuristic)

For whatever remains, same-slug registry entries are ranked by description
similarity (token Jaccard; Han text is compared as character bigrams, the
same trick the shared search index uses) and surfaced on the card as a
确认关联 affordance. The dialog lists the top 5 candidates by similarity
with their percentage, explicitly labeled as a reference, not proof — forks
share descriptions, so 100% similarity still does not *identify* a skill.
There is no similarity floor: a low score only sinks a candidate to the
bottom of the list, because hiding it could hide the one correct repo
(e.g. when the local description is missing or worded differently). Nothing
is written until the user picks one; the confirmed pick lands in the ledger
indistinguishable from a native install.

Why not auto-link at 100% similarity? Measured against the published
snapshot (8,993 skills): 549 slugs are published by ≥2 repos, and 171 of
those (31%) have ≥2 *different* repos carrying byte-identical descriptions
— 525 skills. Every identical-description cluster spans multiple repos
(forks copy the frontmatter verbatim), so a perfect description match is
ambiguous by construction: it selects a fork as readily as the origin, and
the mistake is silent (wrong source link, wrong update stream) with no
corrective signal to the user.

Deliberate non-goals: no silent auto-association from similarity (a wrong
"installed" badge is worse than none), and no threshold at which the heuristic
writes without the user.
