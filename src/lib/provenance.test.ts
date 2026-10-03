import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  parseLedger,
  serializeLedger,
  recordSkillProvenance,
  recordSkillProvenanceBatch,
  reconcileProvenance,
  removeSkillProvenance,
  dismissSkillSource,
  loadPendingRecords,
  savePendingRecords,
  ledgerLines,
  readLedgerRaw,
  resetMockProvenance,
  seedMockLedgerRaw,
  seedMockProvenance,
} from "./provenance";
import type { LedgerRecord, PendingRecord, SourceRecord } from "./provenance";

// The ledger degrades to fewer records on any malformed input; these tests
// pin that contract — a broken file must never break the UI, only lose the
// association (which falls back to name-only matching).

const SOURCE: SourceRecord = {
  kind: "source",
  name: "pdf",
  repo: "anthropics/skills",
  via: "install",
};
const PENDING: PendingRecord = {
  kind: "pending",
  name: "my-tool",
  key: "1a2b3c4d5e6f7081",
  fingerprint: { mtimeMs: 1738022.4, size: 48213 },
  candidates: [
    {
      repo: "a/skills",
      similarity: 0.4,
      stars: 12,
      downloads: 340,
      description: "Read PDF files.",
    },
  ],
};
/** The header every file opens with. */
const HEADER = { kind: "meta", index: '"e1"' };

/** The records of a parsed file, keyed by name. */
function records(raw: string | null): Map<string, LedgerRecord> {
  return parseLedger(raw).records;
}

describe("parseLedger", () => {
  it("parses JSONL records, one per skill, last one winning", () => {
    const ledger = records(
      [
        JSON.stringify(HEADER),
        JSON.stringify(SOURCE),
        JSON.stringify(PENDING),
        JSON.stringify({ kind: "source", name: "pdf", repo: "other/repo" }),
      ].join("\n"),
    );
    expect(ledger.size).toBe(2);
    expect(ledger.get("pdf")).toMatchObject({ repo: "other/repo" });
    expect(ledger.get("my-tool")).toMatchObject({ key: "1a2b3c4d5e6f7081" });
  });

  it("reads the header, and keeps it out of the records", () => {
    const parsed = parseLedger([JSON.stringify(HEADER), JSON.stringify(SOURCE)].join("\n"));
    expect(parsed.index).toBe('"e1"');
    expect([...parsed.records.keys()]).toEqual(["pdf"]);
  });

  it("skips broken lines and keeps the rest", () => {
    const ledger = records(
      [JSON.stringify(SOURCE), "{broken", "not json", JSON.stringify(PENDING)].join("\n"),
    );
    expect([...ledger.keys()]).toEqual(["pdf", "my-tool"]);
  });

  // Table-driven so a failure names the input that broke rather than only
  // reporting that a size was not zero — the three used to be three bare
  // expects in one `it`, all of which reported identically.
  it.each([
    ["null", null],
    ["an empty string", ""],
    ["truncated JSON", "not json {"],
  ] as const)("returns an empty ledger for %s", (_label, raw) => {
    expect(parseLedger(raw).records.size).toBe(0);
  });

  it("rejects records without a usable name or of an unknown kind", () => {
    const ledger = records(
      [
        JSON.stringify({ kind: "source", repo: "a/b" }), // no name
        JSON.stringify({ kind: "source", name: "x" }), // no repo
        JSON.stringify({ kind: "source", name: "y", repo: "" }), // empty repo
        JSON.stringify({ kind: "pending", name: "z" }), // nothing worth keeping
        JSON.stringify({ kind: "someday", name: "w", repo: "a/b" }), // unknown kind
        JSON.stringify({ kind: "source", name: "good", repo: "a/b" }),
      ].join("\n"),
    );
    expect([...ledger.keys()]).toEqual(["good"]);
  });

  it("skips a line it cannot read, whatever the reason", () => {
    // A `kind` this build does not know, a line from before the tag existed,
    // and a whole-document JSON object all land in the same place: skipped.
    // What is left is what answers.
    const ledger = records(
      [
        JSON.stringify({ kind: "someday", name: "a", repo: "o/r" }),
        JSON.stringify({ name: "b", repo: "o/r", installedAt: "2026-09-13T00:00:00.000Z" }),
        JSON.stringify({ version: 1, skills: { c: { repo: "o/r" } } }),
        JSON.stringify(SOURCE),
      ].join("\n"),
    );
    expect([...ledger.keys()]).toEqual(["pdf"]);
  });

  it("parses a single JSONL line stored without a trailing newline", () => {
    expect(records(JSON.stringify(SOURCE)).get("pdf")).toEqual(SOURCE);
    expect(parseLedger(JSON.stringify(HEADER)).index).toBe('"e1"');
  });

  it("parses `via` on source records and rejects unknown values", () => {
    const ledger = records(
      [
        JSON.stringify({ kind: "source", name: "a", repo: "o/r", via: "install" }),
        JSON.stringify({ kind: "source", name: "b", repo: "o/r", via: "confirm" }),
        JSON.stringify({ kind: "source", name: "c", repo: "o/r", via: "bogus" }),
        JSON.stringify({ kind: "source", name: "d", repo: "o/r" }),
      ].join("\n"),
    );
    expect(ledger.get("a")).toMatchObject({ via: "install" });
    expect(ledger.get("b")).toMatchObject({ via: "confirm" });
    expect(ledger.get("c")).not.toHaveProperty("via");
    expect(ledger.get("d")).not.toHaveProperty("via");
  });

  it("parses `repos` on pending records, dropping unusable entries", () => {
    const ledger = records(
      [
        JSON.stringify({ kind: "pending", name: "a", repos: ["x/y", "", 3] }),
        JSON.stringify({ kind: "pending", name: "b", repos: [] }),
        JSON.stringify({
          kind: "pending",
          name: "c",
          candidates: [{ repo: "a/b", similarity: 1, stars: 1, downloads: 1, description: "d" }],
        }),
      ].join("\n"),
    );
    expect(ledger.get("a")).toMatchObject({ repos: ["x/y"] });
    // An empty list leaves nothing worth a line, exactly like no list at all.
    expect(ledger.has("b")).toBe(false);
    expect(ledger.get("c")).not.toHaveProperty("repos");
  });

  it("drops candidates that cannot be rendered", () => {
    const ledger = records(
      JSON.stringify({
        kind: "pending",
        name: "a",
        candidates: [
          { repo: "a/b", similarity: "high", stars: 1, downloads: 1, description: "d" },
          { repo: "c/d", similarity: 0.5, stars: 1, downloads: 1, description: "d" },
        ],
      }),
    );
    expect(ledger.get("a")).toMatchObject({
      candidates: [{ repo: "c/d", similarity: 0.5 }],
    });
  });
});

describe("serializeLedger", () => {
  it("opens with the header, then one line per record", () => {
    const text = serializeLedger('"e1"', [SOURCE, PENDING]);
    expect(text.split("\n").filter(Boolean)).toEqual([
      JSON.stringify(HEADER),
      JSON.stringify(SOURCE),
      JSON.stringify(PENDING),
    ]);
  });

  it("writes a bare header when no snapshot is known", () => {
    expect(serializeLedger(undefined, [SOURCE]).split("\n")[0]).toBe('{"kind":"meta"}');
  });

  it("round-trips records through one line per skill", () => {
    const parsed = parseLedger(serializeLedger('"e1"', [SOURCE, PENDING]));
    expect(parsed.index).toBe('"e1"');
    expect(parsed.records).toEqual(
      new Map<string, LedgerRecord>([
        ["pdf", SOURCE],
        ["my-tool", PENDING],
      ]),
    );
  });
});

// The developer viewer's per-line split: unlike parseLedger it keeps the
// file's own order, duplicates and broken lines — the file as it is.

describe("ledgerLines", () => {
  it("splits JSONL into numbered lines, keeping order and duplicates", () => {
    const lines = ledgerLines(
      [JSON.stringify(SOURCE), JSON.stringify(PENDING), JSON.stringify(SOURCE)].join("\n"),
    );
    expect(lines.map((l) => l.line)).toEqual([1, 2, 3]);
    expect(lines[0]?.record).toEqual(SOURCE);
    expect(lines[1]?.record).toEqual(PENDING);
    expect(lines[2]?.record).toEqual(SOURCE);
  });

  it("flags broken lines with their raw text instead of skipping them", () => {
    const lines = ledgerLines([JSON.stringify(SOURCE), "{broken"].join("\n"));
    expect(lines[0]?.record).toEqual(SOURCE);
    expect(lines[1]?.text).toBe("{broken");
    expect(lines[1]?.record).toBeUndefined();
  });

  it("skips blank lines but keeps later line numbers intact", () => {
    const lines = ledgerLines(
      ["", JSON.stringify(SOURCE), "", JSON.stringify(PENDING)].join("\n"),
    );
    expect(lines.map((l) => l.line)).toEqual([2, 4]);
  });

  it("renders a single line without a trailing newline as one line", () => {
    expect(ledgerLines(JSON.stringify(SOURCE))).toEqual([{ line: 1, record: SOURCE }]);
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["whitespace only", "  \n  "],
  ] as const)("returns no lines for %s", (_label, raw) => {
    expect(ledgerLines(raw)).toEqual([]);
  });
});

// Raw read path backing the developer viewer (browser stand-in here).

describe("readLedgerRaw", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("returns the stored ledger verbatim", async () => {
    seedMockLedgerRaw(JSON.stringify(SOURCE));
    expect(await readLedgerRaw()).toBe(JSON.stringify(SOURCE));
  });

  it("returns null when nothing is stored yet", async () => {
    expect(await readLedgerRaw()).toBeNull();
  });
});

// Browser persistence (the localStorage stand-in for .skill-one.jsonl).

describe("provenance browser store", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("round-trips a recorded install through the persisted ledger", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf");

    const { sources: map } = await reconcileProvenance(["pdf"]);
    expect(map.pdf).toEqual({ repo: "anthropics/skills", via: "install" });
  });

  it("opens a fresh ledger with a header, snapshot unknown", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf");

    // An install says nothing about the dataset, so the header names no
    // snapshot — which is exactly what invalidates any stored ranking.
    const parsed = parseLedger(await readLedgerRaw());
    expect(parsed.index).toBeUndefined();
    expect(await readLedgerRaw()).toContain('{"kind":"meta"}');
  });

  it("a recorded entry for a name that is not installed gets pruned", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });

    const { sources: map } = await reconcileProvenance(["docx"]);
    expect(map).toEqual({});
  });

  it("reconciliation persists the prune", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await reconcileProvenance(["docx"]);

    // A later reconcile against the same disk state stays pruned.
    const { sources: map } = await reconcileProvenance(["docx"]);
    expect(map).toEqual({});
  });

  it("forgets the entry on removal", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await removeSkillProvenance("pdf");

    const { sources: map } = await reconcileProvenance(["pdf"]);
    expect(map).toEqual({});
  });

  it("reinstalls overwrite the recorded source", async () => {
    seedMockProvenance({ pdf: { repo: "old/repo" } });
    await recordSkillProvenance("new/repo", "pdf");

    const { sources: map } = await reconcileProvenance(["pdf"]);
    expect(map.pdf?.repo).toBe("new/repo");
  });

  it("auto-links overwrite a pending record with a source record", async () => {
    await savePendingRecords([{ kind: "pending", name: "pdf", repos: ["fork/skills"] }], [], '"e1"');
    await recordSkillProvenanceBatch([{ repo: "fork/skills", name: "pdf", reason: "description" }]);

    const { sources: map } = await reconcileProvenance(["pdf"]);
    expect(map.pdf).toEqual({ repo: "fork/skills", via: "description" });
    expect((await loadPendingRecords()).records).toEqual({});
  });

  it("records how the source was established via `via`", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf");
    expect((await reconcileProvenance(["pdf"])).sources.pdf?.via).toBe("install");

    await recordSkillProvenance("fork/skills", "pdf", "confirm");
    expect((await reconcileProvenance(["pdf"])).sources.pdf?.via).toBe("confirm");

    await recordSkillProvenanceBatch([{ repo: "o/r", name: "pdf", reason: "description" }]);
    expect((await reconcileProvenance(["pdf"])).sources.pdf?.via).toBe("description");
  });

  it("keeps no timestamp: when a link happened is the activity log's fact", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf");

    const line = (await readLedgerRaw())?.split("\n")[1] ?? "";
    expect(JSON.parse(line)).not.toHaveProperty("installedAt");
  });
});

describe("pending records", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("round-trips upserts through the persisted ledger, stamped with the snapshot", async () => {
    await savePendingRecords([PENDING], [], '"e1"');

    expect(await loadPendingRecords()).toEqual({ index: '"e1"', records: { "my-tool": PENDING } });
  });

  it("re-stamps the header with the snapshot it was given", async () => {
    await savePendingRecords([PENDING], [], '"e1"');
    await savePendingRecords([], [], '"e2"');

    // Nothing to write, so nothing changed — the header still names e1.
    expect((await loadPendingRecords()).index).toBe('"e1"');
  });

  it("leaves the header alone when a source is recorded", async () => {
    await savePendingRecords([PENDING], [], '"e1"');
    await recordSkillProvenance("anthropics/skills", "pdf");

    // An install says nothing about the snapshot the pending records were
    // verified against, so it must not invalidate them.
    expect((await loadPendingRecords()).index).toBe('"e1"');
  });

  it("drops only pending records — a source record for the same name survives", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await savePendingRecords(
      [{ kind: "pending", name: "pdf", repos: ["fork/skills"] }],
      ["pdf"],
      '"e1"',
    );

    expect((await loadPendingRecords()).records).toEqual({});
    const { sources: map } = await reconcileProvenance(["pdf"]);
    expect(map.pdf?.repo).toBe("anthropics/skills");
  });

  it("pending records are pruned with their skill", async () => {
    await savePendingRecords([PENDING], [], '"e1"');
    await reconcileProvenance(["other"]);

    expect((await loadPendingRecords()).records).toEqual({});
  });

  it("reports no snapshot identity when the file names none", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    expect((await loadPendingRecords()).index).toBeUndefined();
  });
});

describe("dismissSkillSource", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("replaces the source record with the cut", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await dismissSkillSource("pdf", "anthropics/skills");

    // The source is gone from the reconcile answer…
    expect((await reconcileProvenance(["pdf"])).sources).toEqual({});
    // …and the cut is persisted as a pending record.
    expect((await loadPendingRecords()).records).toEqual({
      pdf: { kind: "pending", name: "pdf", repos: ["anthropics/skills"] },
    });
  });

  it("accumulates repos, and runs before any source record", async () => {
    await dismissSkillSource("pdf", "a/skills");
    await recordSkillProvenance("b/skills", "pdf", "confirm");
    await dismissSkillSource("pdf", "b/skills");
    await dismissSkillSource("pdf", "a/skills");
    await dismissSkillSource("pdf", "c/skills");

    expect((await loadPendingRecords()).records.pdf).toEqual({
      kind: "pending",
      name: "pdf",
      repos: ["b/skills", "a/skills", "c/skills"],
    });
    expect((await reconcileProvenance(["pdf"])).sources).toEqual({});
  });

  it("hands the cut to the surfaces that offer the namesake list", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await dismissSkillSource("pdf", "anthropics/skills");

    // The repo stays on the candidate list — re-picking it is the user's own
    // act of re-identification — so what the surfaces need is the fact that it
    // was already refused, not its absence.
    const { sources, cut } = await reconcileProvenance(["pdf"]);
    expect(sources).toEqual({});
    expect(cut).toEqual({ pdf: ["anthropics/skills"] });
  });

  it("reports no cut for a skill that only has a ranking pending", async () => {
    // A pending record without `repos` is a suggestion, not a refusal — it must
    // not show up as an empty cut for every unlinked skill.
    await savePendingRecords([PENDING], [], '"e1"');

    expect((await reconcileProvenance(["pdf"])).cut).toEqual({});
  });

  it("keeps the ranking the cut was made against", async () => {
    // The user's cut does not invalidate work already done: dropping the
    // candidates would make every cut re-rank from scratch.
    await savePendingRecords([PENDING], [], '"e1"');
    await dismissSkillSource("my-tool", "a/skills");

    expect((await loadPendingRecords()).records["my-tool"]).toEqual({
      ...PENDING,
      repos: ["a/skills"],
    });
  });
});
