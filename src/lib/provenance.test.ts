import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  parseLedger,
  serializeLedger,
  recordSkillProvenance,
  recordSkillProvenanceBatch,
  reconcileProvenance,
  removeSkillProvenance,
  loadResolutionRecords,
  saveResolutionRecords,
  resetMockProvenance,
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
});
