import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  parseLedger,
  serializeLedger,
  recordSkillProvenance,
  recordSkillProvenanceBatch,
  reconcileProvenance,
  removeSkillProvenance,
  dismissSkillSource,
  loadResolutionRecords,
  saveResolutionRecords,
  ledgerLines,
  readLedgerRaw,
  resetMockProvenance,
  seedMockLedgerRaw,
  seedMockProvenance,
} from "./provenance";
import type { LedgerRecord, ProvenanceRecord, ResolutionRecord } from "./provenance";

// The ledger degrades to fewer records on any malformed input; these tests
// pin that contract — a broken file must never break the UI, only lose the
// association (which falls back to name-only matching).

const SOURCE: ProvenanceRecord = {
  name: "pdf",
  repo: "anthropics/skills",
  installedAt: "2026-09-13T00:00:00.000Z",
};
const RESOLUTION: ResolutionRecord = {
  name: "my-tool",
  epoch: 42,
  hash: "sha256:abc",
  fingerprint: { mtimeMs: 1738022.4, size: 48213 },
};

describe("parseLedger", () => {
  it("parses JSONL records, one per skill, last one winning", () => {
    const ledger = parseLedger(
      [
        JSON.stringify(SOURCE),
        JSON.stringify(RESOLUTION),
        JSON.stringify({ name: "pdf", repo: "other/repo" }),
      ].join("\n"),
    );
    expect(ledger.size).toBe(2);
    expect(ledger.get("pdf")).toMatchObject({ repo: "other/repo" });
    expect(ledger.get("my-tool")).toMatchObject({ epoch: 42 });
  });

  it("skips broken lines and keeps the rest", () => {
    const ledger = parseLedger(
      [JSON.stringify(SOURCE), "{broken", "not json", JSON.stringify(RESOLUTION)].join("\n"),
    );
    expect([...ledger.keys()]).toEqual(["pdf", "my-tool"]);
  });

  it("returns an empty ledger for null, blank and invalid JSON", () => {
    expect(parseLedger(null).size).toBe(0);
    expect(parseLedger("").size).toBe(0);
    expect(parseLedger("not json {").size).toBe(0);
  });

  it("rejects records without a usable name or discriminator", () => {
    const ledger = parseLedger(
      [
        JSON.stringify({ repo: "a/b" }), // no name
        JSON.stringify({ name: "x" }), // no repo, no epoch
        JSON.stringify({ name: "y", repo: "" }), // empty repo
        JSON.stringify({ name: "z", epoch: "42" }), // non-numeric epoch
        JSON.stringify({ name: "good", repo: "a/b" }),
      ].join("\n"),
    );
    expect([...ledger.keys()]).toEqual(["good"]);
  });

  it("converts the legacy v1 JSON document", () => {
    const legacy = JSON.stringify({
      version: 1,
      skills: {
        pdf: { repo: "anthropics/skills", slug: "pdf", installedAt: SOURCE.installedAt },
        noRepo: { slug: "noRepo" },
      },
    });
    const ledger = parseLedger(legacy);
    expect(ledger.size).toBe(1);
    expect(ledger.get("pdf")).toEqual(SOURCE);
  });

  it("parses a single JSONL record stored without a trailing newline", () => {
    const ledger = parseLedger(JSON.stringify(SOURCE));
    expect(ledger.get("pdf")).toEqual(SOURCE);
  });

  it("parses `via` on source records and rejects unknown values", () => {
    const ledger = parseLedger(
      [
        JSON.stringify({ name: "a", repo: "o/r", via: "install" }),
        JSON.stringify({ name: "b", repo: "o/r", via: "confirm" }),
        JSON.stringify({ name: "c", repo: "o/r", via: "bogus" }),
        JSON.stringify({ name: "d", repo: "o/r" }),
      ].join("\n"),
    );
    expect(ledger.get("a")).toMatchObject({ via: "install" });
    expect(ledger.get("b")).toMatchObject({ via: "confirm" });
    expect(ledger.get("c")).not.toHaveProperty("via");
    expect(ledger.get("d")).not.toHaveProperty("via");
  });

  it("parses `dismissed` on resolution records, dropping unusable entries", () => {
    const ledger = parseLedger(
      [
        JSON.stringify({ name: "a", epoch: 1, dismissed: ["x/y", "", 3] }),
        JSON.stringify({ name: "b", epoch: 1, dismissed: [] }),
        JSON.stringify({ name: "c", epoch: 1 }),
      ].join("\n"),
    );
    expect(ledger.get("a")).toMatchObject({ dismissed: ["x/y"] });
    expect(ledger.get("b")).not.toHaveProperty("dismissed");
    expect(ledger.get("c")).not.toHaveProperty("dismissed");
  });
});

describe("serializeLedger", () => {
  it("round-trips records through one line per skill", () => {
    const records: LedgerRecord[] = [SOURCE, RESOLUTION];
    expect(parseLedger(serializeLedger(records))).toEqual(new Map(Object.entries({
      pdf: SOURCE,
      "my-tool": RESOLUTION,
    })));
  });
});

// The developer viewer's per-line split: unlike parseLedger it keeps the
// file's own order, duplicates and broken lines — the file as it is.

describe("ledgerLines", () => {
  it("splits JSONL into numbered lines, keeping order and duplicates", () => {
    const lines = ledgerLines(
      [JSON.stringify(SOURCE), JSON.stringify(RESOLUTION), JSON.stringify(SOURCE)].join("\n"),
    );
    expect(lines.map((l) => l.line)).toEqual([1, 2, 3]);
    expect(lines[0]?.record).toEqual(SOURCE);
    expect(lines[1]?.record).toEqual(RESOLUTION);
    expect(lines[2]?.record).toEqual(SOURCE);
  });

  it("flags broken lines with their raw text instead of skipping them", () => {
    const lines = ledgerLines([JSON.stringify(SOURCE), "{broken"].join("\n"));
    expect(lines[0]?.record).toEqual(SOURCE);
    expect(lines[1]?.text).toBe("{broken");
    expect(lines[1]?.record).toBeUndefined();
  });

  it("skips blank lines but keeps later line numbers intact", () => {
    const lines = ledgerLines(["", JSON.stringify(SOURCE), "", JSON.stringify(RESOLUTION)].join("\n"));
    expect(lines.map((l) => l.line)).toEqual([2, 4]);
  });

  it("converts the legacy v1 document to per-skill records", () => {
    const lines = ledgerLines(
      JSON.stringify({
        version: 1,
        skills: {
          pdf: { repo: "anthropics/skills", installedAt: SOURCE.installedAt },
          noRepo: { slug: "noRepo" },
        },
      }),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      line: 1,
      record: { repo: "anthropics/skills", installedAt: SOURCE.installedAt, name: "pdf" },
    });
    expect(lines[1]).toEqual({ line: 2, record: { slug: "noRepo", name: "noRepo" } });
  });

  it("renders a single record without a trailing newline as one line", () => {
    expect(ledgerLines(JSON.stringify(SOURCE))).toEqual([{ line: 1, record: SOURCE }]);
  });

  it("returns no lines for null, blank and whitespace input", () => {
    expect(ledgerLines(null)).toEqual([]);
    expect(ledgerLines("")).toEqual([]);
    expect(ledgerLines("  \n  ")).toEqual([]);
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

    const map = await reconcileProvenance(["pdf"]);
    expect(map.pdf).toMatchObject({ repo: "anthropics/skills" });
  });

  it("a recorded entry for a name that is not installed gets pruned", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });

    const map = await reconcileProvenance(["docx"]);
    expect(map).toEqual({});
  });

  it("reconciliation persists the prune", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await reconcileProvenance(["docx"]);

    // A later reconcile against the same disk state stays pruned.
    const map = await reconcileProvenance(["docx"]);
    expect(map).toEqual({});
  });

  it("forgets the entry on removal", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await removeSkillProvenance("pdf");

    const map = await reconcileProvenance(["pdf"]);
    expect(map).toEqual({});
  });

  it("preserves a recorded content hash through parse and prune", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await recordSkillProvenance("anthropics/skills", "pdf", "hash-1");

    const map = await reconcileProvenance(["pdf"]);
    expect(map.pdf?.hash).toBe("hash-1");
  });

  it("reinstalls overwrite the recorded source", async () => {
    seedMockProvenance({ pdf: { repo: "old/repo" } });
    await recordSkillProvenance("new/repo", "pdf");

    const map = await reconcileProvenance(["pdf"]);
    expect(map.pdf?.repo).toBe("new/repo");
  });

  it("auto-links overwrite a resolution record with a source record", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await recordSkillProvenanceBatch([{ repo: "fork/skills", name: "pdf", hash: "hash-1" }]);

    const map = await reconcileProvenance(["pdf"]);
    expect(map.pdf).toMatchObject({ repo: "fork/skills", hash: "hash-1" });
  });

  it("records how the source was established via `via`", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf");
    expect((await reconcileProvenance(["pdf"])).pdf?.via).toBe("install");

    await recordSkillProvenance("fork/skills", "pdf", undefined, "confirm");
    expect((await reconcileProvenance(["pdf"])).pdf?.via).toBe("confirm");

    await recordSkillProvenanceBatch([{ repo: "o/r", name: "pdf", reason: "description" }]);
    expect((await reconcileProvenance(["pdf"])).pdf?.via).toBe("description");
  });
});

describe("resolution records", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("round-trips upserts through the persisted ledger", async () => {
    const record: ResolutionRecord = {
      name: "my-tool",
      epoch: 7,
      hash: "sha256:abc",
      fingerprint: { mtimeMs: 1738022.4, size: 48213 },
      namesakesKey: "a\u0000b",
      candidates: [
        {
          repo: "a/skills",
          similarity: 0.93,
          stars: 12,
          downloads: 340,
          description: "Read PDF files.",
          descriptionZh: "读取 PDF 文件。",
        },
      ],
    };
    await saveResolutionRecords([record], []);

    expect(await loadResolutionRecords()).toEqual({ "my-tool": record });
  });

  it("drops only resolution records — a source record for the same name survives", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await saveResolutionRecords(
      [{ name: "pdf", epoch: 1, candidates: [] }],
      ["pdf"],
    );

    const resolutions = await loadResolutionRecords();
    expect(resolutions).toEqual({});
    const map = await reconcileProvenance(["pdf"]);
    expect(map.pdf?.repo).toBe("anthropics/skills");
  });

  it("resolution records are pruned with their skill", async () => {
    await saveResolutionRecords([{ name: "my-tool", epoch: 1, candidates: [] }], []);
    await reconcileProvenance(["other"]);

    expect(await loadResolutionRecords()).toEqual({});
  });

  it("dismissSkillSource replaces the source record with a dismissal", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
    await dismissSkillSource("pdf", "anthropics/skills", 7);

    // The source is gone from the reconcile answer…
    expect(await reconcileProvenance(["pdf"])).toEqual({});
    // …and the dismissal is persisted on the resolution record.
    expect(await loadResolutionRecords()).toEqual({
      pdf: { name: "pdf", epoch: 7, dismissed: ["anthropics/skills"] },
    });
  });

  it("dismissSkillSource accumulates repos and runs before any source record", async () => {
    await dismissSkillSource("pdf", "a/skills", 7);
    await recordSkillProvenance("b/skills", "pdf", undefined, "confirm");
    await dismissSkillSource("pdf", "b/skills", 8);
    await dismissSkillSource("pdf", "a/skills", 8);

    expect(await loadResolutionRecords()).toEqual({
      pdf: { name: "pdf", epoch: 8, dismissed: ["b/skills", "a/skills"] },
    });
    expect(await reconcileProvenance(["pdf"])).toEqual({});
  });
});
