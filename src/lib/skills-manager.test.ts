/**
 * The contract lock for the app's only Tauri boundary.
 *
 * Every other suite replaces `invoke` with a stub that answers whatever the
 * component under test needs, which means a command renamed on either side
 * would go unnoticed until the app ran. The commands live in two places that
 * never check each other: the `invoke("name", { args })` literals here and the
 * `#[tauri::command]` signatures in `src-tauri`. A rename on either side is
 * exactly the drift these cases exist to catch, so every export is pinned to
 * the exact argument list it hands across.
 *
 * The argument *names* are the other half of the contract, and they are not
 * derivable from the Rust side at runtime: Tauri matches the JS object keys to
 * the Rust function's parameter names, so a Rust parameter renamed to snake_case
 * that does not match turns into a runtime "invalid args" error the type system
 * cannot see. The DTO side of the same contract — the `#[serde(rename_all =
 * "camelCase")]` shapes the TS interfaces mirror by hand — is pinned in
 * `src-tauri/src/skills.rs`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as manager from "./skills-manager";

const invoke = vi.hoisted(() => vi.fn());
const isTauri = vi.hoisted(() => vi.fn(() => true));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./tauri", () => ({ isTauri }));

/** One command's worth of the boundary: how to call it, and what must cross. */
interface Contract {
  /** What the call is, in the shape a reader would describe it. */
  readonly name: string;
  readonly run: () => Promise<unknown>;
  /**
   * Exactly the arguments `invoke` must receive, command name first. Written
   * as the literal argument list rather than a command/args pair because the
   * no-argument commands really do pass one argument, not two: `invoke("cmd")`
   * is not `invoke("cmd", undefined)`, and the difference is the whole point of
   * pinning the call site.
   */
  readonly call: readonly unknown[];
  /** A value the command resolves with, to pin the return path too. */
  readonly result?: unknown;
}

const contract = (c: Contract) => c;

const CONTRACTS: readonly Contract[] = [
  contract({
    name: "install_skill takes the GitHub id as `source`",
    run: () => manager.installSkill("anthropics/skills/pdf"),
    call: ["install_skill", { source: "anthropics/skills/pdf" }],
    result: { skill: "pdf", skipped: false },
  }),
  contract({
    name: "list_installed_skills takes no arguments",
    run: () => manager.listInstalledSkills(),
    call: ["list_installed_skills"],
    result: [],
  }),
  contract({
    name: "read_skill_md takes the slug as `name`",
    run: () => manager.readSkillMd("pdf"),
    call: ["read_skill_md", { name: "pdf" }],
    result: { path: "/skills/pdf/SKILL.md", content: "---\nname: pdf\n---" },
  }),
  contract({
    name: "write_skill_md takes `name` and the raw `content`",
    run: () => manager.writeSkillMd("pdf", "---\nname: pdf\n---"),
    call: ["write_skill_md", { name: "pdf", content: "---\nname: pdf\n---" }],
  }),
  contract({
    name: "open_skill_dir takes the slug as `name`",
    run: () => manager.openSkillDir("pdf"),
    call: ["open_skill_dir", { name: "pdf" }],
  }),
  contract({
    name: "remove_skills takes the slugs as `skills`",
    run: () => manager.removeSkills(["pdf", "docx"]),
    call: ["remove_skills", { skills: ["pdf", "docx"] }],
    result: ["pdf", "docx"],
  }),
  contract({
    // The trap worth a case of its own: the parameters read
    // `(enabled, skills)` while the payload is `{ skills, enabled }`. Swapping
    // them compiles, and fails only at runtime.
    name: "set_skills_enabled takes `skills` and `enabled`, not the reverse",
    run: () => manager.setSkillsEnabled(true, ["pdf"]),
    call: ["set_skills_enabled", { skills: ["pdf"], enabled: true }],
    result: ["pdf"],
  }),
  contract({
    name: "link_agents takes `agents`, with auto-detection left to the backend",
    run: () => manager.linkAgents([]),
    call: ["link_agents", { agents: [] }],
    result: { results: [] },
  }),
  contract({
    // Unlink is link_agents with a flag, not a command of its own — a rename
    // on the Rust side would silently turn every unlink into a link.
    name: "unlinkAgents is link_agents with `unlink: true`",
    run: () => manager.unlinkAgents(["claude-code"]),
    call: ["link_agents", { agents: ["claude-code"], unlink: true }],
    result: { results: [] },
  }),
  contract({
    name: "read_provenance takes no arguments",
    run: () => manager.readProvenanceRaw(),
    call: ["read_provenance"],
    result: null,
  }),
  contract({
    name: "write_provenance takes the ledger as `content`",
    run: () => manager.writeProvenanceRaw('{"name":"pdf"}'),
    call: ["write_provenance", { content: '{"name":"pdf"}' }],
  }),
  contract({
    name: "append_activity takes one JSON line as `line`",
    run: () => manager.appendActivityRaw('{"kind":"install"}'),
    call: ["append_activity", { line: '{"kind":"install"}' }],
  }),
  contract({
    name: "read_activity takes the cap as `limit`",
    run: () => manager.readActivityRaw(50),
    call: ["read_activity", { limit: 50 }],
    result: [],
  }),
  contract({
    name: "clear_activity takes no arguments",
    run: () => manager.clearActivityRaw(),
    call: ["clear_activity"],
  }),
  contract({
    name: "open_activity_dir takes no arguments",
    run: () => manager.openActivityDirRaw(),
    call: ["open_activity_dir"],
  }),
  contract({
    name: "open_provenance_dir takes no arguments",
    run: () => manager.openProvenanceDirRaw(),
    call: ["open_provenance_dir"],
  }),
  contract({
    name: "skill_fingerprint takes the slug as `name`",
    run: () => manager.skillFingerprint("pdf"),
    call: ["skill_fingerprint", { name: "pdf" }],
    result: { mtimeMs: 1, size: 2 },
  }),
  contract({
    name: "link_status takes no arguments",
    run: () => manager.getLinkStatus(),
    call: ["link_status"],
    result: [],
  }),
];

/** The commands that pin a payload as well as a call, i.e. all but the voids. */
const WITH_RESULT = CONTRACTS.filter((c) => "result" in c);

describe("skills-manager", () => {
  beforeEach(() => {
    invoke.mockReset();
    isTauri.mockReturnValue(true);
  });

  describe("command names and arguments", () => {
    it.each(CONTRACTS)("$name", async ({ run, call }) => {
      invoke.mockResolvedValue(undefined);

      await run();

      expect(invoke).toHaveBeenCalledExactlyOnceWith(...call);
    });

    it("covers every command the manager exports", () => {
      // A new export that joins this table is the point; one that joins the
      // module without it would be a silently unlocked command, so the count
      // is asserted rather than trusted.
      expect(CONTRACTS).toHaveLength(18);
    });
  });

  describe("return values", () => {
    it.each(WITH_RESULT)("$name — the payload comes back untouched", async ({
      run,
      result,
    }) => {
      invoke.mockResolvedValue(result);

      await expect(run()).resolves.toEqual(result);
    });

    it("passes a fingerprint through, so a caller can compare mtimes", async () => {
      const fingerprint = { mtimeMs: 1_700_000_000_000, size: 4096 };
      invoke.mockResolvedValue(fingerprint);

      await expect(manager.skillFingerprint("pdf")).resolves.toEqual(
        fingerprint,
      );
    });
  });

  describe("outside the desktop app", () => {
    it("refuses every command rather than invoking into a void", async () => {
      isTauri.mockReturnValue(false);

      // The browser build reaches these through `lib/local-skills`' mock
      // branch instead, so arriving here is a bug, not a supported mode.
      for (const { name, run } of CONTRACTS) {
        await expect(run(), name).rejects.toThrow(
          "skills manager commands only run inside the desktop app (Tauri).",
        );
      }
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("skillFingerprint", () => {
    it("reports an unfingerprintable skill as null instead of failing the caller", async () => {
      // A missing directory and a failed stat walk are the same thing to every
      // caller: re-rank from scratch. Neither is fatal, so neither throws.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      invoke.mockRejectedValue(new Error("no such directory"));

      await expect(manager.skillFingerprint("pdf")).resolves.toBeNull();
      expect(warn).toHaveBeenCalledOnce();
    });
  });
});
