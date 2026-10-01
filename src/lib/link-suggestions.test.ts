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
import type { ResolutionRecord } from "./provenance";

const {
  searchSkills,
  getRegistrySnapshot,
  analyzeSkill,
  skillFingerprint,
  recordSkillProvenanceBatch,
  loadResolutionRecords,
  saveResolutionRecords,
  dismissSkillSource,
  isTauri,
} = vi.hoisted(() => ({
  searchSkills: vi.fn(),
  getRegistrySnapshot: vi.fn(),
  analyzeSkill: vi.fn(),
  skillFingerprint: vi.fn(),
  recordSkillProvenanceBatch: vi.fn(),
  loadResolutionRecords: vi.fn(),
  saveResolutionRecords: vi.fn(),
  dismissSkillSource: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("./registry/client", () => ({ searchSkills, getRegistrySnapshot }));
vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({
  analyzeSkill,
  skillFingerprint,
  // The activity log's append path: this module links skills, which records an
  // event; the write itself is not under test here.
  appendActivityRaw: vi.fn(),
}));
vi.mock("./provenance", () => ({
  recordSkillProvenanceBatch,
  loadResolutionRecords,
  saveResolutionRecords,
  dismissSkillSource,
}));

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

function mockReady(entries: Skill[]) {
  getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 1 });
  searchSkills.mockResolvedValue({
    hits: entries.map((skill) => ({ skill, matched: {} })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLinkSuggestions();
  isTauri.mockReturnValue(true);
  loadResolutionRecords.mockResolvedValue({});
  mockReady([]);
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
    // Hash tier misses, but the wording matches the namesake 100% — close
    // enough to be the same skill, so it links without a prompt.
    mockReady([namesake("anthropics/skills")]);
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: null });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual(["pdf"]);
    expect(suggestions).toEqual({});
    // A description match does not verify content, so no version marker.
    expect(recordSkillProvenanceBatch).toHaveBeenCalledWith([
      { repo: "anthropics/skills", name: "pdf", reason: "description" },
    ]);
  });

  it("auto-links by similarity even outside Tauri (no real files needed)", async () => {
    isTauri.mockReturnValue(false);
    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(analyzeSkill).not.toHaveBeenCalled();
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
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: null });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
  });

  it("links a matching description regardless of the local hash (the registry publishes none)", async () => {
    // The registry no longer carries per-skill hashes, so the local hash
    // matches nothing — the description tier is the only auto-link.
    mockReady([
      namesake("anthropics/skills"),
      namesake("fork/skills"),
    ]);
    analyzeSkill.mockResolvedValue({ hash: "hash-fork", fingerprint: null });

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
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: null });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    // The outcome is persisted, so a restart starts from the ledger.
    expect(saveResolutionRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "pdf", epoch: 1, hash: "hash-other" })],
      [],
    );
  });

  it("memoizes description misses for the session but keeps suggesting", async () => {
    mockReady([namesake("anthropics/skills")]);
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: null });

    const first = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);
    expect(first.suggestions.pdf).toHaveLength(1);

    // Second pass: no re-hash, but the candidates are still offered.
    const second = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);
    expect(second.suggestions.pdf).toHaveLength(1);
    expect(analyzeSkill).toHaveBeenCalledTimes(1);
  });

  it("reuses the stored outcome across a restart while snapshot and content are unchanged", async () => {
    mockReady([namesake("anthropics/skills")]);
    const fingerprint = { mtimeMs: 1000, size: 200 };
    const stored: ResolutionRecord = {
      name: "pdf",
      epoch: 1,
      hash: "hash-other",
      fingerprint,
      namesakesKey: "x",
      candidates: [],
    };
    // The suggestion variant of the record: ranked candidates awaiting
    // confirmation, their hash/fingerprint guarding any re-work.
    stored.candidates = [
      {
        repo: "anthropics/skills",
        similarity: 0.4,
        stars: 10,
        downloads: 10,
        description: "Read and manipulate PDF files.",
      },
    ];
    loadResolutionRecords.mockResolvedValue({ pdf: stored });
    skillFingerprint.mockResolvedValue(fingerprint);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    // No worker query, no disk walk — the ledger answers.
    expect(searchSkills).not.toHaveBeenCalled();
    expect(analyzeSkill).not.toHaveBeenCalled();
    expect(skillFingerprint).toHaveBeenCalledTimes(1);
    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
    expect(suggestions.pdf[0].skill.name).toBe("pdf");
  });

  it("re-hashes when the stored fingerprint no longer matches the disk", async () => {
    mockReady([namesake("anthropics/skills")]);
    loadResolutionRecords.mockResolvedValue({
      pdf: {
        name: "pdf",
        epoch: 1,
        hash: "hash-other",
        fingerprint: { mtimeMs: 1000, size: 200 },
        namesakesKey: "x",
        candidates: [
          {
            repo: "anthropics/skills",
            similarity: 0.4,
            stars: 10,
            downloads: 10,
            description: "Read and manipulate PDF files.",
          },
        ],
      },
    });
    // The skill was edited on disk: fingerprint mismatch, fresh analysis.
    skillFingerprint.mockResolvedValue({ mtimeMs: 2000, size: 300 });
    analyzeSkill.mockResolvedValue({ hash: "hash-a", fingerprint: { mtimeMs: 2000, size: 300 } });

    const { linked } = await resolveAssociations([{ name: "pdf" }]);

    expect(analyzeSkill).toHaveBeenCalledTimes(1);
    expect(linked).toEqual([]);
  });

  it("reuses the stored hash against a new snapshot without re-hashing", async () => {
    // First session: the hash missed.
    mockReady([namesake("anthropics/skills")]);
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: { mtimeMs: 1, size: 2 } });
    await resolveAssociations([{ name: "pdf", description: "Read and convert PDF files." }]);
    expect(analyzeSkill).toHaveBeenCalledTimes(1);

    // Restart (fresh memo) with a new snapshot; the stale-epoch record falls
    // through to the lookup, and the stored hash is reused after the
    // fingerprint revalidation — no re-hash.
    resetLinkSuggestions();
    loadResolutionRecords.mockResolvedValue({
      pdf: {
        name: "pdf",
        epoch: 1,
        hash: "hash-other",
        fingerprint: { mtimeMs: 1, size: 2 },
        namesakesKey: "x",
        candidates: [
          {
            repo: "anthropics/skills",
            similarity: 0.4,
            stars: 10,
            downloads: 10,
            description: "Read and manipulate PDF files.",
          },
        ],
      },
    });
    getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 2 });
    noteRegistryEpoch(2);
    skillFingerprint.mockResolvedValue({ mtimeMs: 1, size: 2 });

    await resolveAssociations([{ name: "pdf", description: "Read and convert PDF files." }]);
    expect(analyzeSkill).toHaveBeenCalledTimes(1);
    expect(skillFingerprint).toHaveBeenCalledTimes(1);
  });

  it("skips hashing for skills with no namesakes at all", async () => {
    mockReady([]);
    searchSkills.mockResolvedValue({ hits: [] });

    const { linked, suggestions } = await resolveAssociations([
      { name: "totally-custom", description: "whatever" },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions).toEqual({});
    expect(analyzeSkill).not.toHaveBeenCalled();
  });

  it("treats an unavailable analysis as a miss, not an error", async () => {
    mockReady([namesake("anthropics/skills")]);
    // `analyzeSkill` reports failure as null (it owns the catch).
    analyzeSkill.mockResolvedValue(null);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    // Still confirmable by the user through the suggestion list.
    expect(suggestions.pdf).toHaveLength(1);
  });

  it("re-checks missed names once the registry epoch moves", async () => {
    mockReady([namesake("a/skills")]);
    // The local copy hashes to something the current snapshot does not carry.
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: null });
    await resolveAssociations([{ name: "pdf" }]);
    expect(analyzeSkill).toHaveBeenCalledTimes(1);

    // A new snapshot publishes the rev the local hash was waiting for; the
    // memoized miss must not survive the epoch change.
    getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 2 });
    noteRegistryEpoch(2);
    analyzeSkill.mockResolvedValue({ hash: "hash-a", fingerprint: null });
    const { linked } = await resolveAssociations([{ name: "pdf" }]);
    expect(linked).toEqual([]);
    expect(analyzeSkill).toHaveBeenCalledTimes(2);
  });

  it("runs no hash tier outside Tauri (the mock has no real files)", async () => {
    isTauri.mockReturnValue(false);
    mockReady([namesake("anthropics/skills")]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(analyzeSkill).not.toHaveBeenCalled();
    expect(linked).toEqual([]);
    expect(suggestions.pdf).toHaveLength(1);
  });

  it("returns nothing when the registry is not ready", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: false, epoch: 0 });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "read pdf files" },
    ]);
    expect(linked).toEqual([]);
    expect(suggestions).toEqual({});
    expect(analyzeSkill).not.toHaveBeenCalled();
    expect(searchSkills).not.toHaveBeenCalled();
  });

  it("never auto-links a repo the user dismissed, but keeps it as a candidate", async () => {
    mockReady([namesake("anthropics/skills")]);
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: null });
    loadResolutionRecords.mockResolvedValue({
      pdf: { name: "pdf", epoch: 1, dismissed: ["anthropics/skills"] },
    });

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    // The perfect description match is dismissed — no auto-link; the choice
    // stays with the user, and the dismissed repo remains among the
    // candidates it can still be picked from manually.
    expect(linked).toEqual([]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    expect(suggestions.pdf.map((c) => c.skill.repo)).toEqual(["anthropics/skills"]);
    // The dismissal is carried into the persisted outcome.
    expect(saveResolutionRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "pdf", dismissed: ["anthropics/skills"] })],
      [],
    );
  });

  it("auto-links the best non-dismissed namesake", async () => {
    mockReady([
      namesake("anthropics/skills"),
      namesake("fork/skills"),
    ]);
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: null });
    loadResolutionRecords.mockResolvedValue({
      pdf: { name: "pdf", epoch: 1, dismissed: ["anthropics/skills"] },
    });

    const { linked } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual(["pdf"]);
    expect(recordSkillProvenanceBatch).toHaveBeenCalledWith([
      { repo: "fork/skills", name: "pdf", reason: "description" },
    ]);
  });

  it("keeps the dismissal when the skill has no namesakes", async () => {
    mockReady([]);
    loadResolutionRecords.mockResolvedValue({
      pdf: { name: "pdf", epoch: 1, dismissed: ["a/skills"] },
    });

    await resolveAssociations([{ name: "pdf" }]);

    expect(saveResolutionRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "pdf", epoch: 1, dismissed: ["a/skills"] })],
      [],
    );
  });
});

describe("findLinkCandidates", () => {
  it("ranks the skill's namesakes without writing anything", async () => {
    mockReady([namesake("a/skills"), namesake("b/skills", { description: "unrelated" })]);

    const candidates = await findLinkCandidates("pdf", "Read and manipulate PDF files.");

    expect(candidates.map((c) => c.skill.repo)).toEqual(["a/skills", "b/skills"]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    expect(saveResolutionRecords).not.toHaveBeenCalled();
  });

  it("excludes the currently linked repo", async () => {
    mockReady([namesake("a/skills"), namesake("b/skills")]);

    const candidates = await findLinkCandidates("pdf", "whatever", {
      excludeRepo: "a/skills",
    });

    expect(candidates.map((c) => c.skill.repo)).toEqual(["b/skills"]);
  });

  it("returns nothing when the registry is not ready", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: false, epoch: 0 });
    expect(await findLinkCandidates("pdf")).toEqual([]);
  });
});

describe("unlinkSkillSource", () => {
  it("dismisses the repo against the served snapshot epoch", async () => {
    mockReady([namesake("anthropics/skills")]);

    await unlinkSkillSource("pdf", "anthropics/skills");

    expect(dismissSkillSource).toHaveBeenCalledWith("pdf", "anthropics/skills", 1);
  });

  it("clears the session memo, so the next pass re-runs the lookup", async () => {
    mockReady([namesake("anthropics/skills")]);
    analyzeSkill.mockResolvedValue({ hash: "hash-other", fingerprint: null });
    // Warm the memo with a dead end.
    await resolveAssociations([{ name: "totally-custom" }]);
    expect(searchSkills).toHaveBeenCalledTimes(1);

    await unlinkSkillSource("totally-custom", "a/skills");
    await resolveAssociations([{ name: "totally-custom" }]);

    expect(searchSkills).toHaveBeenCalledTimes(2);
  });
});
