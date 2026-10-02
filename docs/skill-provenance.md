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

The app keeps its own record — the **provenance ledger** — as a JSONL file: a
header line, then one line per skill, last line wins:

```
~/.agents/skills/.skill-one.jsonl
```

```jsonc
// The header, always first: the identity of the registry snapshot the pending
// records below were computed against.
{"kind":"meta","index":"\"a1b2c3\""}

// A source record: the skill is linked to its store entry. `via` states how —
// `install` (this app installed it), `confirm` (the user picked the source
// from candidates) or `description` (auto-linked) — which is how the detail
// drawer tells a store install from a linked third-party copy.
{"kind":"source","name":"pdf","repo":"anthropics/skills","via":"install"}

// A pending record: a suggestion still waiting on the user. `candidates` are
// the ranked namesakes, `key` a digest of the ranking input, `fingerprint`
// the stat-only directory state they were computed against. `repos` are ones
// the user cut: the auto-link never links those back on its own, while the
// user can still pick one by hand.
{"kind":"pending","name":"my-tool","key":"1a2b3c4d5e6f7081","fingerprint":{"mtimeMs":1738022.4,"size":48213},"candidates":[…],"repos":["someone/skills"]}
```

Every line says what it is: `kind` discriminates the shapes, so a record is
read as what it claims to be rather than as an inference from which fields
happen to be present. The header's `index` is the served snapshot's `etag`
(`IndexInfo.etag` — equal etag, equal index bytes), which makes "is this
cached ranking still good?" one comparison against the snapshot being served
now. It is deliberately not the client-side `epoch` counter, which restarts
at zero with every process and would validate a month-old record against
today's dataset. A header that names no snapshot vouches for nothing: its
cached records are recomputed rather than trusted.

Two things the format deliberately does not carry, and one it refuses to
cache, each because nothing read them or nothing could:

- **No timestamps.** The ledger never displayed an install time — the UI reads
  the filesystem's own stamp off the installed record — and for a third-party
  copy the only time the app knew was the moment it wrote the *association*,
  which is not an install. When a link happened is the activity log's fact.
- **No content hash.** The registry stopped publishing per-skill hashes, so a
  stored hash had nothing to be compared against. The tier that computed one
  (`analyze_skill` and `skill_hash.rs`) is gone with it: what guards a cached
  ranking is the stat-only `fingerprint`, which answers the only question the
  ledger asks of a directory — has it changed — without reading a file byte.
  An association pass over a dozen unlinked skills now costs a dozen stat
  walks, not a dozen full content reads.
- **No dead ends.** A skill with no same-slug registry entry is worth no line
  at all: re-deriving it is one in-memory query, and a stored one would be
  re-written in bulk on every snapshot change. What is persisted is what was
  expensive (a ranking) or was a decision (a cut), so a name disappearing from
  the ledger is the format working, not data loss.

Unknown or broken lines are skipped, and that per-line tolerance is the whole
safety story: a line this build cannot read — malformed, hand-edited, or
written by a format it does not know — is dropped while the rest of the file
still answers. There is no format version and no older shape to read. A format
change is a whole-file replacement, and whatever a build could parse it can
also express.

Key properties:

- **Written after every successful install** (`installSkillFromSource`), keyed
  by skill name. Reinstalling overwrites the entry.
- **Pruned on reconciliation.** Every time the installed list loads, entries
  whose skill no longer exists on disk are dropped, so skills removed outside
  the app stop claiming a source.
- **Cleared on uninstall.**
- **Best-effort on both ends.** Ledger failures never fail the install or
  removal they document; a missing or corrupt file degrades to fewer records
  (name-only matching, the pre-ledger behavior).
- **Invisible to other tools.** The file is a hidden dotfile without a
  `SKILL.md`, so the `agents-skills` directory scan ignores it entirely.

### Storage choice

The ledger lives next to the skills it describes (not in the Tauri app-data
directory), so reconciliation is a direct ledger↔disk comparison and the
association survives app reinstalls. The trade-off: moving `~/.agents`
elsewhere loses the mapping — accepted, since the skills themselves move with
it and the ledger is rebuilt by future installs.

### Backend surface

The Rust side stays thin — fixed-path file commands plus the directory
identity, no ledger schema knowledge (parsing, merging and pruning live in
`src/lib/provenance.ts`):

| Command | Behavior |
| --- | --- |
| `read_provenance` | Raw ledger content; `null` when it does not exist yet |
| `write_provenance` | Full-document replace, atomic (temp file + rename) |
| `open_provenance_dir` | Reveal the ledger's directory (the global skills directory) in the system file manager |
| `skill_fingerprint` | Stat-only directory fingerprint (latest mtime + total size, no file bytes read) — what guards a stored ranking |

All resolve paths internally (`<home>/.agents/skills/…`); no caller-controlled
paths are accepted.

### Developer viewer

Settings → 开发者 opens `developer-dialog.tsx`, a read-only debugging surface
over the ledger: it renders the file as it actually is — one card per line, in
file order, duplicates included, every field shown (unknown fields included,
under their raw key), broken lines flagged with their verbatim text rather
than skipped — plus a raw JSONL view and a reveal-in-folder action. It
deliberately does **not** reuse `parseLedger`'s tolerant merging: the app must
decide what to act on, but a developer asking "why does this skill think it
came from X" needs to see the record the app is not acting on too.

## Consumers

- **Install buttons** (`skill-install-button.tsx`): a skill on disk counts as
  "installed" for a store entry when the names match *and* the ledger entry's
  `repo` matches the store entry's (or when there is no ledger entry — unknown
  source falls back to name-only). A same-named skill from a different repo
  stays installable.
- **Installed page** (`installed-page.tsx`): the page lists the same installs in
  either shape — the repository cards (卡片) and the skill rows (列表, read by
  热度 or 按安装时间) — and every shape presents a skill identically, so a skill reads
  the same wherever it is listed. A row
  with a ledger entry carries
  the owner's GitHub avatar (the author chip on the card's metadata rail, whose
  hover card names the repo the card itself no longer prints) and the drawer's
  repo line; the detail drawer links to the source repo instead of reading as
  本地安装. The recorded source is also
  resolved back to its registry entry (`use-installed-store-entries.ts`, over
  the worker's `lookupSkills`), which is where the store's classification and
  install count come from — an on-disk record carries neither, so without
  the lookup the installed list could only ever render the store's card with
  those two slots empty. A source that resolves to nothing (tool installs, or
  an entry the index no longer lists) keeps the local-install presentation and
  shows no figure rather than a fabricated zero; `SkillView.storeBacked` is
  what records that difference, and both the card and the detail drawer read
  it the same way. Its author chip is the one part that survives: the ledger
  vouches for the repo even when the registry does not. And a card's image slot
  falls back to the skill's own initial whenever no cover can be addressed.
  A repository card's bar opens that repository as *this* list reads it
  (`/installed/repo/owner/repo`): the installs the ledger placed there, listed
  with the installed list's own chrome, and the rest of the store's catalogue
  for the same repository behind one control at the foot of the list. The
  store's own page for it (`/repo/owner/repo`) stays one step further away,
  which is why a card no longer leads straight to it.

## Associating skills installed by other tools

The ledger only covers installs made through this app. Skills installed by
other tools (the `npx skills` CLI, manual copies) are associated by the same
reconcile query (`use-skill-provenance.ts`, `lib/link-suggestions.ts`), and
only when the registry snapshot is ready. It runs cheap-first.

### Step 1 — the namesake filter

A skill with no same-slug registry entry is a plain local skill: nothing to
associate, and no reason to look at its directory at all. This is one in-memory
query against the worker's search index, which is why its "no namesakes"
verdict earns no line in the ledger — see the format section above.

### Step 2 — description auto-link, then ranked candidates

The remaining namesakes are ranked by description similarity (token Jaccard;
Han text is compared as character bigrams, the same trick the shared search
index uses).

**Auto-link at ≥ 90%.** When the best namesake's similarity reaches
`SIMILARITY_AUTO_LINK_THRESHOLD` (0.9), the wording is close enough to call
the two skills the same, so the association is written into the ledger
automatically — no prompt, and the card shows the source repo the same way a
native install does.

**Below 90% — surfaced for confirmation.** The ranking is stored as a pending
record, so a restart revives it instead of redoing the similarity math, and the
candidates are shown on the card as a 确认关联 affordance. The dialog lists the top 5 candidates by
similarity with their percentage, explicitly labeled as a reference, not proof
— forks share descriptions, so a high score still does not *identify* a skill.
There is no lower floor: a low score only sinks a candidate to the bottom of
the list, because hiding it could hide the one correct repo (e.g. when the
local description is missing or worded differently). Nothing is written until
the user picks one; the confirmed pick lands in the ledger indistinguishable
from a native install.

Why 90% and not a stricter floor? Measured against the published snapshot
(8,993 skills): 549 slugs are published by ≥2 repos, and 171 of those (31%)
have ≥2 *different* repos carrying byte-identical descriptions — 525 skills.
Every identical-description cluster spans multiple repos (forks copy the
frontmatter verbatim), so a perfect description match is ambiguous by
construction: it can select a fork as readily as the origin. The 90% threshold
deliberately trades the rare silent mislink (wrong source link, wrong update
stream) for far fewer prompts on genuinely identical skills — the one case
where the user would confirm the obvious anyway — while still leaving anything
below 90% to the user's judgement.

## Re-selecting and cutting a source in the detail drawer

The detail drawer's source line is the provenance surface: its hover tooltip
states how the recorded source was established (store install via this app, a
linked third-party copy, or an unlinked local install), and the line carries
the re-selection affordances:

- **Unlinked, candidates exist** — the local-install label becomes the same
  确认关联 trigger the list rows show, opening the ranked namesake candidates.
- **Linked** — a quiet chevron beside the repo opens a change-source popover:
  the source currently on record (pinned and marked), the other same-name
  store entries (`findLinkCandidates`, ranked like the suggestions but
  excluding the current repo, fetched when the popover opens), and the way
  out. A confirmed pick is written like a native install (`via: "confirm"`);
  nothing is written until the user picks or unlinks.

**Unlinking cuts the repo.** Cutting the association replaces the source record
with a pending record listing that repo in `repos`, so the auto-link tiers
never chain it back on their own — the user's cut is a decision, not a cache.
Everything else the record already knew stays: the candidates, the fingerprint
and the ranking digest survive, so re-deciding later costs nothing. The cut
repo still surfaces among the manual candidates, since picking it again is the
user's own act of re-identification. Inside a running session the suggestion
memo is cleared, so the next reconcile pass immediately re-runs the lookup and
offers what remains.
