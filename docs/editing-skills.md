# Editing an Installed Skill's SKILL.md

How the detail drawer lets a locally installed skill's `SKILL.md` be edited in
place, and the boundaries of that editing.

中文版：[editing-skills.zh-CN.md](./editing-skills.zh-CN.md)

## Scope

Only **installed** skills can be edited. A skill's file lives at
`~/.agents/skills/<name>/SKILL.md` — or `disabled-skills/<name>/SKILL.md` while
it is parked. A store row that is not installed is remote mirror content with
nothing local to write to, so the edit affordance is offered on the installed
surface alone (the my-skills and local-skills lists, and any installed section
of the store).

The body is headed by a divider that carries the file's name: the rule runs the
full inset width behind a centered `SKILL.md` label, with the content action
pinned to its right end — one divider, not a second title bar. The label and
the action sit on the popover surface, so they break the line. The action holds
its place across modes — view shows an edit icon, edit shows 取消/保存 — so it
always sits next to the content it acts on rather than among the management
controls (install / enable / remove).

## What is edited

The **raw file**, frontmatter included — not the rendered body. This matters
because a save must round-trip the file verbatim: the display detail carries
only the body (the frontmatter is parsed off for the header), so the editor
reads the raw text separately through `readSkillMd` and writes it back through
`writeSkillMd`.

## Saving

`write_skill_md` resolves the skill name through the backend's `list` (so no
path is ever interpolated from the frontend) and writes **atomically**: the new
text lands in a sibling `SKILL.md.tmp` that is then renamed over `SKILL.md`, so
an interrupted write can never leave a half-written file behind. A save
invalidates the detail cache, the raw cache and the installed list — a row's
description is read from the file, so it refreshes with the edit.

## Editor integration

The editor is CodeMirror 6 through `@uiw/react-codemirror` with
`@codemirror/lang-markdown`, loaded lazily so the CodeMirror chunk only rides in
once a skill is opened for editing. It rides the app's existing shadcn CSS
variables rather than a bundled theme package, so light/dark follow
`next-themes` for free; the feature set is trimmed to highlighting, history and
search (no line numbers, folding or completion).

## Guardrails and known limits

- While editing, `←`/`→` do not switch skills and `Escape` does not close the
  drawer, so a draft is only discarded through the explicit **取消** button.
- Closing the drawer another way while editing (clicking the overlay) does drop
  the draft — there is no unsaved-changes prompt.
- Concurrent edits made outside the app are not detected; the last write wins.
- Outside Tauri (the browser dev server) edited text is kept in the in-memory
  mock store, so a reload discards it.
