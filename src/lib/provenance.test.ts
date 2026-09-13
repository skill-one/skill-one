import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  emptyProvenanceLedger,
  parseProvenanceLedger,
  pruneProvenance,
  recordSkillProvenance,
  reconcileProvenance,
  removeSkillProvenance,
  resetMockProvenance,
  seedMockProvenance,
  upsertProvenanceEntry,
  dropProvenanceEntry,
} from "./provenance";

// The ledger degrades to an empty one on any malformed input; these tests pin
// that contract — a broken file must never break the UI, only lose the
// association (which falls back to name-only matching).

describe("parseProvenanceLedger", () => {
  it("parses a valid ledger document", () => {
    const ledger = parseProvenanceLedger(
      JSON.stringify({
        version: 1,
        skills: {
          pdf: {
            repo: "anthropics/skills",
            slug: "pdf",
            installedAt: "2026-09-13T00:00:00.000Z",
          },
        },
      }),
    );
    expect(ledger.version).toBe(1);
    expect(ledger.skills.pdf).toMatchObject({
      repo: "anthropics/skills",
      slug: "pdf",
    });
  });

  it("returns an empty ledger for null, blank and invalid JSON", () => {
    expect(parseProvenanceLedger(null)).toEqual(emptyProvenanceLedger());
    expect(parseProvenanceLedger("")).toEqual(emptyProvenanceLedger());
    expect(parseProvenanceLedger("not json {")).toEqual(emptyProvenanceLedger());
  });

  it("rejects a document with an unknown version", () => {
    expect(
      parseProvenanceLedger(JSON.stringify({ version: 2, skills: {} })),
    ).toEqual(emptyProvenanceLedger());
  });

  it("drops malformed entries but keeps well-formed ones", () => {
    const ledger = parseProvenanceLedger(
      JSON.stringify({
        version: 1,
        skills: {
          good: { repo: "a/b", slug: "good" },
          noRepo: { slug: "noRepo" },
          noSlug: { repo: "a/b" },
          empty: { repo: "", slug: "" },
          null: null,
        },
      }),
    );
    expect(Object.keys(ledger.skills)).toEqual(["good"]);
  });

  it("defaults a missing installedAt to an empty string", () => {
    const ledger = parseProvenanceLedger(
      JSON.stringify({
        version: 1,
        skills: { pdf: { repo: "a/b", slug: "pdf" } },
      }),
    );
    expect(ledger.skills.pdf.installedAt).toBe("");
  });
});

describe("upsertProvenanceEntry / dropProvenanceEntry", () => {
  it("adds an entry and stamps installedAt", () => {
    const before = new Date().getTime() - 1;
    const ledger = upsertProvenanceEntry(emptyProvenanceLedger(), {
      repo: "anthropics/skills",
      slug: "pdf",
    });
    const after = new Date().getTime() + 1;
    expect(ledger.skills.pdf?.repo).toBe("anthropics/skills");
    const stamp = new Date(ledger.skills.pdf!.installedAt).getTime();
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  });

  it("replaces an existing entry for the same slug", () => {
    let ledger = upsertProvenanceEntry(emptyProvenanceLedger(), {
      repo: "old/repo",
      slug: "pdf",
    });
    ledger = upsertProvenanceEntry(ledger, { repo: "new/repo", slug: "pdf" });
    expect(Object.keys(ledger.skills)).toEqual(["pdf"]);
    expect(ledger.skills.pdf?.repo).toBe("new/repo");
  });

  it("drops only the named entry and keeps the rest", () => {
    let ledger = upsertProvenanceEntry(emptyProvenanceLedger(), {
      repo: "a/b",
      slug: "pdf",
    });
    ledger = upsertProvenanceEntry(ledger, { repo: "c/d", slug: "docx" });
    ledger = dropProvenanceEntry(ledger, "pdf");
    expect(Object.keys(ledger.skills)).toEqual(["docx"]);
  });

  it("dropping an unknown entry is a no-op", () => {
    const ledger = emptyProvenanceLedger();
    expect(dropProvenanceEntry(ledger, "ghost")).toBe(ledger);
  });
});

describe("pruneProvenance", () => {
  function ledgerWith(names: string[]) {
    let ledger = emptyProvenanceLedger();
    for (const name of names) {
      ledger = upsertProvenanceEntry(ledger, { repo: `o/${name}`, slug: name });
    }
    return ledger;
  }

  it("drops entries whose skill no longer exists on disk", () => {
    const { ledger, changed } = pruneProvenance(ledgerWith(["pdf", "docx"]), [
      "pdf",
    ]);
    expect(changed).toBe(true);
    expect(Object.keys(ledger.skills)).toEqual(["pdf"]);
  });

  it("reports no change when the ledger already matches the disk", () => {
    const ledger = ledgerWith(["pdf"]);
    const result = pruneProvenance(ledger, ["pdf", "docx"]);
    expect(result.changed).toBe(false);
    expect(result.ledger).toBe(ledger);
  });
});

// Browser persistence (the localStorage stand-in for .skill-one.json).

describe("provenance browser store", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("round-trips a recorded install through the persisted ledger", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf");

    const map = await reconcileProvenance(["pdf"]);
    expect(map.pdf).toMatchObject({ repo: "anthropics/skills", slug: "pdf" });
  });

  it("a recorded entry for a name that is not installed gets pruned", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });

    const map = await reconcileProvenance(["docx"]);
    expect(map).toEqual({});
  });

  it("reconciliation persists the prune", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    await reconcileProvenance(["docx"]);

    // A later reconcile against the same disk state stays pruned.
    const map = await reconcileProvenance(["docx"]);
    expect(map).toEqual({});
  });

  it("forgets the entry on removal", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    await removeSkillProvenance("pdf");

    const map = await reconcileProvenance(["pdf"]);
    expect(map).toEqual({});
  });

  it("reinstalls overwrite the recorded source", async () => {
    seedMockProvenance({ pdf: { repo: "old/repo", slug: "pdf" } });
    await recordSkillProvenance("new/repo", "pdf");

    const map = await reconcileProvenance(["pdf"]);
    expect(map.pdf?.repo).toBe("new/repo");
  });
});
