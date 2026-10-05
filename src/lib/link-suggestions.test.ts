import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  MAX_CANDIDATES,
  findLinkCandidates,
  noteRegistryEpoch,
  rankNamesakes,
  resetLinkSuggestions,
  resolveAssociations,
  unlinkSkillSource,
} from "./link-suggestions";
import type { Skill } from "../types/skill";
import type { PendingRecord, StoredPending } from "./provenance";

const {
  namesakeSkills,
  getRegistrySnapshot,
  skillFingerprint,
  recordSkillProvenanceBatch,
  loadPendingRecords,
  savePendingRecords,
  dismissSkillSource,
  isTauri,
  searchSkillsSh,
} = vi.hoisted(() => ({
  namesakeSkills: vi.fn(),
  getRegistrySnapshot: vi.fn(),
  skillFingerprint: vi.fn(),
  recordSkillProvenanceBatch: vi.fn(),
  loadPendingRecords: vi.fn(),
  savePendingRecords: vi.fn(),
  dismissSkillSource: vi.fn(),
  isTauri: vi.fn(),
  searchSkillsSh: vi.fn().mockResolvedValue([]),
}));

vi.mock("./registry/client", () => ({ namesakeSkills, getRegistrySnapshot }));
vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-sh", () => ({
  searchSkillsSh,
  isSearchableQuery: (q: string) => q.trim().length >= 2,
}));
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

/**
 * A ready registry serving `entries` under the given snapshot identity. The
 * worker's name index is what answers namesake lookups here: entries are
 * filed under their own name, and a name nothing was filed under comes back
 * empty.
 */
function mockReady(entries: Skill[], etag: string = ETAG) {
  getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 1, index: { etag } });
  const byName = new Map<string, Skill[]>();
  for (const skill of entries) {
    const family = byName.get(skill.name);
    if (family) family.push(skill);
    else byName.set(skill.name, [skill]);
  }
  namesakeSkills.mockImplementation(async (names: string[]) => ({
    entries: names.map((name) => byName.get(name) ?? []),
  }));
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
  searchSkillsSh.mockResolvedValue([]);
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

  it("breaks an equal-similarity tie by popularity", () => {
    // Two forks of the same wording score identically, so the order decides
    // which one a threshold decision would pick. The store's namesake ranking
    // breaks the same tie the same way; here it is what makes the answer
    // stable rather than a function of registry order.
    const ranked = rankNamesakes(
      [
        namesake("quiet/skills", { downloads: 10, stars: 10 }),
        namesake("popular/skills", { downloads: 5000, stars: 900 }),
      ],
      "Read and manipulate PDF files.",
    );

    expect(ranked.map((c) => c.skill.repo)).toEqual([
      "popular/skills",
      "quiet/skills",
    ]);
    // The tie-break never reorders across scores.
    expect(ranked.map((c) => c.similarity)).toEqual([1, 1]);
  });

  it("prioritizes highly reputable repository over minor-similarity fork", () => {
    const ranked = rankNamesakes(
      [
        namesake("fork/skills", {
          description: "PDF files tool.",
          stars: 50,
          downloads: 10,
        }),
        namesake("anthropics/skills", {
          description: "Read, generate, and manipulate PDF documents.",
          stars: 150000,
          downloads: 500000,
        }),
      ],
      "PDF tools",
    );

    expect(ranked[0].skill.repo).toBe("anthropics/skills");
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
  it("surfaces matching namesakes as suggestions for user confirmation without auto-linking", async () => {
    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
  });

  it("surfaces suggestions outside Tauri too (no files to stat)", async () => {
    isTauri.mockReturnValue(false);
    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(skillFingerprint).not.toHaveBeenCalled();
    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
  });

  it("surfaces ranked candidates when descriptions differ", async () => {
    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
  });

  it("surfaces candidates without auto-linking regardless of content", async () => {
    mockReady([
      namesake("anthropics/skills"),
      namesake("fork/skills", { description: "entirely different wording" }),
    ]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf).toHaveLength(2);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
  });

  it("auto-links nothing when two namesakes match equally well", async () => {
    // The fork case the threshold cannot resolve: identical wording on both
    // sides scores the same, so the descriptions cannot say which repo this
    // skill came from. Picking one silently would be a coin flip the user
    // never sees, so the choice goes to them instead.
    mockReady([namesake("anthropics/skills"), namesake("fork/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(
      suggestions.pdf.map((c) => c.similarity),
    ).toEqual([1, 1]);
    expect(linked).toEqual([]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    // Both stay on offer — the fork is still a legitimate manual pick.
    expect(suggestions.pdf.map((c) => c.skill.repo)).toEqual([
      "anthropics/skills",
      "fork/skills",
    ]);
  });

  it("looks every unlinked skill up in one query", async () => {
    mockReady([
      namesake("a/skills", { name: "pdf" }),
      namesake("b/skills", { name: "csv", description: "Read and convert CSV files." }),
    ]);
    skillFingerprint.mockResolvedValue({ mtimeMs: 1, size: 2 });

    await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
      { name: "csv", description: "Read and convert CSV files." },
      { name: "totally-custom", description: "nothing here" },
    ]);

    // One round trip for the whole pass, carrying every name that still needs
    // an answer — the dead end included, since only the worker knows it.
    expect(namesakeSkills).toHaveBeenCalledTimes(1);
    expect(namesakeSkills).toHaveBeenCalledWith(["pdf", "csv", "totally-custom"]);
  });

  it("asks for nothing when the ledger already answers every skill", async () => {
    mockReady([namesake("anthropics/skills")]);
    mockLedger({ records: { pdf: pending() } });
    skillFingerprint.mockResolvedValue({ mtimeMs: 1000, size: 200 });

    await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    // The fast path's whole point: a restart that the ledger fully covers
    // costs no registry query at all.
    expect(namesakeSkills).not.toHaveBeenCalled();
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
    expect(namesakeSkills).not.toHaveBeenCalled();
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
    expect(namesakeSkills).toHaveBeenCalledTimes(1);
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

    expect(namesakeSkills).toHaveBeenCalledTimes(1);
  });

  it("re-ranks when the stored fingerprint no longer matches the disk", async () => {
    mockReady([namesake("anthropics/skills")]);
    mockLedger({ records: { pdf: pending() } });
    // The skill was edited on disk: fingerprint mismatch, fresh ranking.
    skillFingerprint.mockResolvedValue({ mtimeMs: 2000, size: 300 });

    const { suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(namesakeSkills).toHaveBeenCalledTimes(1);
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
    expect(namesakeSkills).toHaveBeenCalledTimes(1);

    // A new dataset can publish namesakes the previous one lacked, so the
    // memoized dead end must not survive it.
    mockReady([namesake("a/skills")], '"e2"');
    getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 2, index: { etag: '"e2"' } });
    noteRegistryEpoch(2);
    await resolveAssociations([{ name: "pdf" }]);
    expect(namesakeSkills).toHaveBeenCalledTimes(2);
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
    expect(namesakeSkills).not.toHaveBeenCalled();
    // A registry that is not ready has no snapshot to stamp and no verdict to
    // record, so the pass produces nothing — the stored records stay exactly
    // as they are until it answers, rather than being stamped with nothing.
    expect(savePendingRecords).toHaveBeenCalledWith([], [], undefined);
  });

  it("surfaces candidates without auto-linking and persists pending ranking", async () => {
    mockReady([namesake("anthropics/skills")]);
    skillFingerprint.mockResolvedValue({ mtimeMs: 1, size: 2 });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    expect(suggestions.pdf.map((c) => c.skill.repo)).toEqual(["anthropics/skills"]);
    expect(savePendingRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "pdf" })],
      [],
      ETAG,
    );
  });

  it("falls back to skills.sh when store has no namesake", async () => {
    mockReady([]);
    searchSkillsSh.mockResolvedValue([
      {
        name: "pdf",
        id: "acme/skills/pdf",
        repo: "acme/skills",
        description: "",
        stars: 0,
        downloads: 500,
        url: "https://www.skills.sh/acme/skills/pdf",
        storeBacked: false,
      },
    ]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf).toHaveLength(1);
    expect(suggestions.pdf[0].skill.repo).toBe("acme/skills");
    expect(suggestions.pdf[0].skill.downloads).toBe(500);
  });

  it("filters out non-exact slug results from skills.sh fallback", async () => {
    mockReady([]);
    searchSkillsSh.mockResolvedValue([
      {
        name: "pdf-extractor",
        id: "acme/skills/pdf-extractor",
        repo: "acme/skills",
        description: "",
        stars: 0,
        downloads: 500,
        url: "https://www.skills.sh/acme/skills/pdf-extractor",
        storeBacked: false,
      },
    ]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions).toEqual({});
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

  it("falls back to skills.sh when store has no namesake", async () => {
    mockReady([]);
    searchSkillsSh.mockResolvedValue([
      {
        name: "pdf",
        id: "acme/skills/pdf",
        repo: "acme/skills",
        description: "",
        stars: 0,
        downloads: 500,
        url: "https://www.skills.sh/acme/skills/pdf",
        storeBacked: false,
      },
    ]);

    const candidates = await findLinkCandidates("pdf");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].skill.repo).toBe("acme/skills");
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
    expect(namesakeSkills).toHaveBeenCalledTimes(1);

    await unlinkSkillSource("totally-custom", "a/skills");
    await resolveAssociations([{ name: "totally-custom" }]);

    expect(namesakeSkills).toHaveBeenCalledTimes(2);
  });
});
