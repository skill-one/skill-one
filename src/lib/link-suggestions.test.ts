import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  MAX_CANDIDATES,
  findLinkCandidates,
  noteRegistryEpoch,
  rankNamesakes,
  resetLinkSuggestions,
  resolveAssociations,
  SIMILARITY_AUTO_LINK_THRESHOLD,
  unlinkSkillSource,
} from "./link-suggestions";
import { descriptionSimilarity } from "./description-similarity";
import type { Skill } from "../types/skill";
import type { PendingRecord, StoredPending } from "./provenance";

const {
  searchSkills,
  getRegistrySnapshot,
  skillFingerprint,
  recordSkillProvenanceBatch,
  loadPendingRecords,
  savePendingRecords,
  dismissSkillSource,
  isTauri,
} = vi.hoisted(() => ({
  searchSkills: vi.fn(),
  getRegistrySnapshot: vi.fn(),
  skillFingerprint: vi.fn(),
  recordSkillProvenanceBatch: vi.fn(),
  loadPendingRecords: vi.fn(),
  savePendingRecords: vi.fn(),
  dismissSkillSource: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("./registry/client", () => ({ searchSkills, getRegistrySnapshot }));
vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({
  skillFingerprint,
  // The activity log's append path: this module links skills, which records an
  // event; the write itself is not under test here.
  appendActivityRaw: vi.fn(),
}));
vi.mock("./provenance", () => ({
  recordSkillProvenanceBatch,
  loadPendingRecords,
  savePendingRecords,
  dismissSkillSource,
}));

/** The snapshot identity the mocked registry serves. */
const ETAG = '"e1"';

/** A namesake entry, as the registry serves it (no per-skill hash anymore). */
function namesake(repo: string, overrides: Partial<Skill> = {}): Skill {
  const name = overrides.name ?? "pdf";
  return {
    name,
    repo,
    description: "Read and manipulate PDF files.",
    stars: 10,
    downloads: 10,
    path: `skills/x/${name}`,
    ...overrides,
  };
}

/** A ready registry serving `entries` under the given snapshot identity. */
function mockReady(entries: Skill[], etag: string = ETAG) {
  getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 1, index: { etag } });
  searchSkills.mockResolvedValue({
    hits: entries.map((skill) => ({ skill, matched: {} })),
  });
}

/** Nothing stored yet: no header, no records. */
function mockLedger(stored: Partial<StoredPending> = {}) {
  loadPendingRecords.mockResolvedValue({ index: ETAG, records: {}, ...stored });
}

/** A pending record awaiting the user's confirmation. */
function pending(overrides: Partial<PendingRecord> = {}): PendingRecord {
  return {
    kind: "pending",
    name: "pdf",
    key: "1a2b3c4d5e6f7081",
    fingerprint: { mtimeMs: 1000, size: 200 },
    candidates: [
      {
        repo: "anthropics/skills",
        similarity: 0.4,
        stars: 10,
        downloads: 10,
        description: "Read and manipulate PDF files.",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLinkSuggestions();
  isTauri.mockReturnValue(true);
  mockLedger();
  mockReady([]);
  skillFingerprint.mockResolvedValue(null);
});

describe("rankNamesakes", () => {
  it("keeps same-slug namesakes, ranked by similarity", () => {
    // Exact-slug filtering already happened in findNamesakes; the ranking
    // only orders and caps.
    const ranked = rankNamesakes(
      [
        namesake("a/skills", { description: "Read and manipulate PDF files." }),
        namesake("b/skills", { description: " totally unrelated " }),
      ],
      "Read and manipulate PDF files.",
    );
    expect(ranked.map((c) => c.skill.repo)).toEqual(["a/skills", "b/skills"]);
    expect(ranked[0].similarity).toBe(1);
  });

  it("keeps dissimilar candidates, ranked last", () => {
    const ranked = rankNamesakes(
      [
        namesake("a/skills", { description: "cook italian pasta" }),
        namesake("b/skills", { description: "Read and manipulate PDF files." }),
      ],
      "Read and manipulate PDF files.",
    );
    // No similarity floor: the user decides, low scores just sink.
    expect(ranked.map((c) => c.skill.repo)).toEqual(["b/skills", "a/skills"]);
    expect(ranked[1].similarity).toBe(0);
  });

  it("compares a Chinese local description against the entry's Chinese translation", () => {
    const localDescription = "读取和处理 PDF 文件。";
    const ranked = rankNamesakes(
      [
        namesake("a/skills", {
          description: "Read and manipulate PDF files.",
          descriptionZh: "读取和处理 PDF 文件。",
        }),
        namesake("b/skills", {
          description: "Read and manipulate PDF files.",
        }),
      ],
      localDescription,
    );

    // The entry carrying the matching Chinese translation wins over the
    // English-only one despite identical English descriptions.
    expect(ranked.map((c) => c.skill.repo)).toEqual(["a/skills", "b/skills"]);
    expect(ranked[0].similarity).toBe(1);
  });

  it("caps the candidate list", () => {
    const ranked = rankNamesakes(
      Array.from({ length: 10 }, (_, i) =>
        namesake(`repo-${i}/skills`, {
          description: `Read and manipulate PDF files v${i}`,
        }),
      ),
      "Read and manipulate PDF files.",
    );
    expect(ranked).toHaveLength(MAX_CANDIDATES);
  });
});

describe("resolveAssociations", () => {
  it("auto-links a near-identical description at/above the threshold", async () => {
    // The wording matches the namesake 100% — close enough to be the same
    // skill, so it links without a prompt.
    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual(["pdf"]);
    expect(suggestions).toEqual({});
    expect(recordSkillProvenanceBatch).toHaveBeenCalledWith([
      { repo: "anthropics/skills", name: "pdf", reason: "description" },
    ]);
  });

  it("auto-links by description outside Tauri too (no files to stat)", async () => {
    isTauri.mockReturnValue(false);
    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(skillFingerprint).not.toHaveBeenCalled();
    expect(linked).toEqual(["pdf"]);
    expect(suggestions).toEqual({});
  });

  it("does not auto-link a below-threshold description, still suggests", async () => {
    // "convert" vs "manipulate" drops similarity below the 0.9 threshold, so
    // the decision is left to the user.
    expect(
      descriptionSimilarity("Read and convert PDF files.", namesake("a").description),
    ).toBeLessThan(SIMILARITY_AUTO_LINK_THRESHOLD);

    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
  });

  it("links a matching description regardless of any content hash", async () => {
    // The registry carries no per-skill hash, so a description match is the
    // only auto-link there is.
    mockReady([namesake("anthropics/skills"), namesake("fork/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual(["pdf"]);
    expect(suggestions).toEqual({});
    expect(recordSkillProvenanceBatch).toHaveBeenCalledWith([
      { repo: "anthropics/skills", name: "pdf", reason: "description" },
    ]);
  });

  it("offers ranked suggestions when the description misses", async () => {
    mockReady([namesake("anthropics/skills")]);
    skillFingerprint.mockResolvedValue({ mtimeMs: 1, size: 2 });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    // The outcome is persisted against the snapshot it was computed from, so a
    // restart starts from the ledger.
    expect(savePendingRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ kind: "pending", name: "pdf", key: expect.any(String) })],
      [],
      ETAG,
    );
  });

  it("never re-stats a skill the session memo already settled", async () => {
    mockReady([namesake("anthropics/skills")]);
    skillFingerprint.mockResolvedValue({ mtimeMs: 1, size: 2 });

    const first = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);
    expect(first.suggestions.pdf).toHaveLength(1);

    // Second pass: the memo answers, so not even a stat call happens.
    const second = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);
    expect(second.suggestions.pdf).toHaveLength(1);
    expect(skillFingerprint).toHaveBeenCalledTimes(1);
  });

  it("reuses the stored ranking across a restart while snapshot and content hold", async () => {
    mockReady([namesake("anthropics/skills")]);
    mockLedger({ records: { pdf: pending() } });
    skillFingerprint.mockResolvedValue({ mtimeMs: 1000, size: 200 });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    // No worker query, no re-ranking: the ledger answers.
    expect(searchSkills).not.toHaveBeenCalled();
    expect(skillFingerprint).toHaveBeenCalledTimes(1);
    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
    expect(suggestions.pdf[0].skill.name).toBe("pdf");
  });

  it("re-ranks when the served snapshot is not the one on record", async () => {
    mockReady([namesake("anthropics/skills")], '"e2"');
    mockLedger({ records: { pdf: pending() } });
    skillFingerprint.mockResolvedValue({ mtimeMs: 1000, size: 200 });

    await resolveAssociations([{ name: "pdf", description: "Read and convert PDF files." }]);

    // A new dataset can carry other namesakes, so the lookup re-runs…
    expect(searchSkills).toHaveBeenCalledTimes(1);
    // …and the record is re-stamped with the snapshot it now belongs to.
    expect(savePendingRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "pdf" })],
      [],
      '"e2"',
    );
  });

  it("trusts nothing when the file names no snapshot", async () => {
    // The records are still there, but nothing may claim they are current.
    mockReady([namesake("anthropics/skills")]);
    mockLedger({ index: undefined, records: { pdf: pending() } });
    skillFingerprint.mockResolvedValue({ mtimeMs: 1000, size: 200 });

    await resolveAssociations([{ name: "pdf", description: "Read and convert PDF files." }]);

    expect(searchSkills).toHaveBeenCalledTimes(1);
  });

  it("re-ranks when the stored fingerprint no longer matches the disk", async () => {
    mockReady([namesake("anthropics/skills")]);
    mockLedger({ records: { pdf: pending() } });
    // The skill was edited on disk: fingerprint mismatch, fresh ranking.
    skillFingerprint.mockResolvedValue({ mtimeMs: 2000, size: 300 });

    const { suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(searchSkills).toHaveBeenCalledTimes(1);
    expect(suggestions.pdf).toHaveLength(1);
  });

  it("skips the directory entirely for skills with no namesakes at all", async () => {
    mockReady([]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "totally-custom", description: "whatever" },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions).toEqual({});
    expect(skillFingerprint).not.toHaveBeenCalled();
  });

  it("caches no dead end: nothing is written for a skill with no namesake", async () => {
    mockReady([]);

    await resolveAssociations([{ name: "totally-custom" }]);

    // A dead end is one in-memory query that cannot go stale between runs, so
    // it is recomputed rather than stored: the pass produces no records at all,
    // upserts or drops, which the write treats as nothing to do.
    expect(savePendingRecords).toHaveBeenCalledWith([], [], ETAG);
  });

  it("drops a stored ranking the fresh run no longer reproduces", async () => {
    // The namesake left the dataset, so the stored candidates are stale.
    mockReady([]);
    mockLedger({ records: { pdf: pending() } });

    await resolveAssociations([{ name: "pdf" }]);

    expect(savePendingRecords).toHaveBeenCalledWith([], ["pdf"], ETAG);
  });

  it("treats an unreadable directory as a miss, not an error", async () => {
    mockReady([namesake("anthropics/skills")]);
    // `skillFingerprint` reports failure as null (it owns the catch).
    skillFingerprint.mockResolvedValue(null);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    // Still confirmable by the user, and stored without a fingerprint — so the
    // next run re-ranks it rather than trusting a guard it never got.
    expect(suggestions.pdf).toHaveLength(1);
    expect(savePendingRecords).toHaveBeenCalledWith(
      [expect.not.objectContaining({ fingerprint: expect.anything() })],
      [],
      ETAG,
    );
  });

  it("re-checks a settled skill once the served dataset changes", async () => {
    mockReady([namesake("a/skills")]);
    await resolveAssociations([{ name: "pdf" }]);
    expect(searchSkills).toHaveBeenCalledTimes(1);

    // A new dataset can publish namesakes the previous one lacked, so the
    // memoized dead end must not survive it.
    mockReady([namesake("a/skills")], '"e2"');
    getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 2, index: { etag: '"e2"' } });
    noteRegistryEpoch(2);
    await resolveAssociations([{ name: "pdf" }]);
    expect(searchSkills).toHaveBeenCalledTimes(2);
  });

  it("stores no fingerprint outside Tauri (the mock has no real files)", async () => {
    isTauri.mockReturnValue(false);
    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(skillFingerprint).not.toHaveBeenCalled();
    expect(linked).toEqual([]);
    expect(suggestions.pdf).toHaveLength(1);
  });

  it("returns nothing when the registry is not ready", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: false, epoch: 0, index: null });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "read pdf files" },
    ]);
    expect(linked).toEqual([]);
    expect(suggestions).toEqual({});
    expect(skillFingerprint).not.toHaveBeenCalled();
    expect(searchSkills).not.toHaveBeenCalled();
    // A registry that is not ready has no snapshot to stamp and no verdict to
    // record, so the pass produces nothing — the stored records stay exactly
    // as they are until it answers, rather than being stamped with nothing.
    expect(savePendingRecords).toHaveBeenCalledWith([], [], undefined);
  });

  it("never auto-links a repo the user cut, but keeps it as a candidate", async () => {
    mockReady([namesake("anthropics/skills")]);
    mockLedger({ records: { pdf: pending({ repos: ["anthropics/skills"] }) } });
    skillFingerprint.mockResolvedValue({ mtimeMs: 1, size: 2 });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    // The perfect description match is cut — no auto-link; the choice stays
    // with the user, and the cut repo remains among the candidates it can still
    // be picked from manually.
    expect(linked).toEqual([]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    expect(suggestions.pdf.map((c) => c.skill.repo)).toEqual(["anthropics/skills"]);
    // The cut is carried into the persisted outcome.
    expect(savePendingRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "pdf", repos: ["anthropics/skills"] })],
      [],
      ETAG,
    );
  });

  it("auto-links the best namesake that was not cut", async () => {
    mockReady([namesake("anthropics/skills"), namesake("fork/skills")]);
    mockLedger({ records: { pdf: pending({ repos: ["anthropics/skills"] }) } });
    skillFingerprint.mockResolvedValue({ mtimeMs: 1, size: 2 });

    const { linked } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual(["pdf"]);
    expect(recordSkillProvenanceBatch).toHaveBeenCalledWith([
      { repo: "fork/skills", name: "pdf", reason: "description" },
    ]);
  });

  it("keeps the cut when the skill has no namesakes", async () => {
    mockReady([]);
    mockLedger({ records: { pdf: pending({ name: "pdf", candidates: undefined, repos: ["a/skills"] }) } });

    await resolveAssociations([{ name: "pdf" }]);

    // A cut outlives any cache: the record stays, stripped to the decision.
    expect(savePendingRecords).toHaveBeenCalledWith(
      [{ kind: "pending", name: "pdf", repos: ["a/skills"] }],
      [],
      ETAG,
    );
  });
});

describe("findLinkCandidates", () => {
  it("ranks the skill's namesakes without writing anything", async () => {
    mockReady([namesake("a/skills"), namesake("b/skills", { description: "unrelated" })]);

    const candidates = await findLinkCandidates("pdf", "Read and manipulate PDF files.");

    expect(candidates.map((c) => c.skill.repo)).toEqual(["a/skills", "b/skills"]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    expect(savePendingRecords).not.toHaveBeenCalled();
  });

  it("excludes the currently linked repo", async () => {
    mockReady([namesake("a/skills"), namesake("b/skills")]);

    const candidates = await findLinkCandidates("pdf", "whatever", {
      excludeRepo: "a/skills",
    });

    expect(candidates.map((c) => c.skill.repo)).toEqual(["b/skills"]);
  });

  it("returns nothing when the registry is not ready", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: false, epoch: 0, index: null });
    expect(await findLinkCandidates("pdf")).toEqual([]);
  });
});

describe("unlinkSkillSource", () => {
  it("records the cut against the skill", async () => {
    mockReady([namesake("anthropics/skills")]);

    await unlinkSkillSource("pdf", "anthropics/skills");

    expect(dismissSkillSource).toHaveBeenCalledWith("pdf", "anthropics/skills");
  });

  it("clears the session memo, so the next pass re-runs the lookup", async () => {
    mockReady([namesake("anthropics/skills")]);
    // Warm the memo with a dead end.
    await resolveAssociations([{ name: "totally-custom" }]);
    expect(searchSkills).toHaveBeenCalledTimes(1);

    await unlinkSkillSource("totally-custom", "a/skills");
    await resolveAssociations([{ name: "totally-custom" }]);

    expect(searchSkills).toHaveBeenCalledTimes(2);
  });
});
