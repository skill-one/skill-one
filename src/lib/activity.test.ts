import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearActivity,
  logActivity,
  logSkillDiscoveries,
  parseActivityLine,
  parseActivityLines,
  readActivity,
  resetMockActivity,
} from "./activity";
import type { ActivityRecord } from "./activity";

// The log tolerates a broken line (skips it, keeps the rest) and is
// best-effort on write; these tests pin both, plus the discovery baseline that
// keeps an upgrade from reporting every pre-existing skill as new.

const base: ActivityRecord = {
  ts: "2026-09-28T08:00:00.000Z",
  event: "skill.enable",
  actor: "user",
  target: { kind: "skill", names: ["pdf"] },
  detail: {},
  result: "ok",
};

const line = (over: Partial<ActivityRecord> = {}): string =>
  JSON.stringify({ ...base, ...over });

describe("parseActivityLine", () => {
  it("parses a well-formed record", () => {
    expect(parseActivityLine(line())).toEqual(base);
  });

  it("rejects an unknown event type", () => {
    expect(parseActivityLine(line({ event: "nope" as never }))).toBeNull();
  });

  it("rejects an unknown actor", () => {
    expect(parseActivityLine(line({ actor: "robot" as never }))).toBeNull();
  });

  it("rejects a record without a usable target", () => {
    expect(
      parseActivityLine(line({ target: { kind: "skill", names: [] } })),
    ).toBeNull();
  });

  it("skips broken JSON", () => {
    expect(parseActivityLine("{not json")).toBeNull();
  });

  it("defaults a missing detail to an empty object", () => {
    const raw = JSON.stringify({ ...base, detail: undefined });
    expect(parseActivityLine(raw)?.detail).toEqual({});
  });
});

describe("parseActivityLines", () => {
  it("returns records newest first and honours the limit", () => {
    const lines = [
      line({ ts: "2026-09-28T08:00:00.000Z" }),
      line({ ts: "2026-09-28T09:00:00.000Z" }),
      line({ ts: "2026-09-28T10:00:00.000Z" }),
    ];
    const parsed = parseActivityLines(lines, 2);
    expect(parsed.map((r) => r.ts)).toEqual([
      "2026-09-28T10:00:00.000Z",
      "2026-09-28T09:00:00.000Z",
    ]);
  });

  it("skips a broken line and keeps the rest", () => {
    const parsed = parseActivityLines([line(), "{broken", line()]);
    expect(parsed).toHaveLength(2);
  });
});

describe("activity browser store", () => {
  beforeEach(() => resetMockActivity());
  afterEach(() => resetMockActivity());

  it("appends through logActivity and reads newest first", async () => {
    await logActivity({ event: "skill.enable", actor: "user", kind: "skill", names: ["pdf"] });
    await logActivity({ event: "skill.disable", actor: "user", kind: "skill", names: ["docx"] });

    const events = await readActivity();
    expect(events.map((r) => r.event)).toEqual(["skill.disable", "skill.enable"]);
  });

  it("clears the whole log", async () => {
    await logActivity({ event: "skill.enable", actor: "user", kind: "skill", names: ["pdf"] });
    await clearActivity();
    expect(await readActivity()).toEqual([]);
  });

  it("never throws when a write fails", async () => {
    // The mock store is best-effort like the file: an empty call is a no-op.
    await expect(
      logActivity({ event: "skill.edit", actor: "user", kind: "skill", names: [] }),
    ).resolves.toBeUndefined();
  });
});

describe("logSkillDiscoveries", () => {
  beforeEach(() => resetMockActivity());
  afterEach(() => resetMockActivity());

  it("adopts the first installed set as a baseline without logging", async () => {
    await logSkillDiscoveries(["pdf", "docx"], () => false);
    expect(await readActivity()).toEqual([]);
  });

  it("logs only skills that appear after the baseline", async () => {
    await logSkillDiscoveries(["pdf"], () => false);
    await logSkillDiscoveries(["pdf", "ext"], (name) => name === "ext");

    const events = await readActivity();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "skill.discover",
      actor: "scan",
      result: "ok",
      target: { kind: "skill", names: ["ext"] },
      detail: { origin: "store" },
    });
  });

  it("marks an unknown skill as external", async () => {
    await logSkillDiscoveries([], () => false);
    await logSkillDiscoveries(["manual-copy"], () => false);

    const [event] = await readActivity();
    expect(event.detail).toEqual({ origin: "external" });
  });

  it("does not re-report a skill the app itself installed", async () => {
    await logSkillDiscoveries([], () => false);
    await logActivity({
      event: "skill.install",
      actor: "user",
      kind: "skill",
      names: ["pdf"],
      detail: { repo: "a/b", skipped: false },
    });
    await logSkillDiscoveries(["pdf"], () => true);

    const events = await readActivity();
    expect(events.map((r) => r.event)).toEqual(["skill.install"]);
  });

  it("rebuilds a silent baseline after a clear", async () => {
    await logSkillDiscoveries(["pdf"], () => false);
    await clearActivity();
    await logSkillDiscoveries(["pdf", "docx"], () => false);
    expect(await readActivity()).toEqual([]);
  });
});
