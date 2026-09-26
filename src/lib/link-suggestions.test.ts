import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  MAX_CANDIDATES,
  noteRegistryEpoch,
  rankNamesakes,
  resetLinkSuggestions,
  resolveAssociations,
  SIMILARITY_AUTO_LINK_THRESHOLD,
} from "./link-suggestions";
import { descriptionSimilarity } from "./description-similarity";
import type { Skill } from "../types/skill";

const {
  searchSkills,
  getRegistrySnapshot,
  computeSkillHash,
  recordSkillProvenanceBatch,
  isTauri,
} = vi.hoisted(() => ({
  searchSkills: vi.fn(),
  getRegistrySnapshot: vi.fn(),
  computeSkillHash: vi.fn(),
  recordSkillProvenanceBatch: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("./registry/client", () => ({ searchSkills, getRegistrySnapshot }));
vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({ computeSkillHash }));
vi.mock("./provenance", () => ({ recordSkillProvenanceBatch }));

/** A namesake entry; `rev` doubles as the hash-matching handle. */
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
    mockReady([namesake("anthropics/skills", { rev: "hash-a" })]);
    computeSkillHash.mockResolvedValue("hash-other");

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual(["pdf"]);
    expect(suggestions).toEqual({});
    // A description match does not verify content, so no version marker.
    expect(recordSkillProvenanceBatch).toHaveBeenCalledWith([
      { repo: "anthropics/skills", slug: "pdf" },
    ]);
  });

  it("auto-links by similarity even outside Tauri (no real files needed)", async () => {
    isTauri.mockReturnValue(false);
    mockReady([namesake("anthropics/skills", { rev: "hash-a" })]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(computeSkillHash).not.toHaveBeenCalled();
    expect(linked).toEqual(["pdf"]);
    expect(suggestions).toEqual({});
  });

  it("does not auto-link a below-threshold description, still suggests", async () => {
    // "convert" vs "manipulate" drops similarity below the 0.9 threshold, so
    // the decision is left to the user.
    expect(
      descriptionSimilarity("Read and convert PDF files.", namesake("a").description),
    ).toBeLessThan(SIMILARITY_AUTO_LINK_THRESHOLD);

    mockReady([namesake("anthropics/skills", { rev: "hash-a" })]);
    computeSkillHash.mockResolvedValue("hash-other");

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
  });

  it("auto-links a hash-identical namesake via one batched ledger write", async () => {
    mockReady([
      namesake("anthropics/skills", { rev: "hash-a" }),
      namesake("fork/skills", { rev: "hash-fork" }),
    ]);
    computeSkillHash.mockResolvedValue("hash-fork");

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and manipulate PDF files." },
    ]);

    expect(linked).toEqual(["pdf"]);
    expect(suggestions).toEqual({});
    // The matched hash is stored as the installed version marker.
    expect(recordSkillProvenanceBatch).toHaveBeenCalledWith([
      { repo: "fork/skills", slug: "pdf", hash: "hash-fork" },
    ]);
  });

  it("offers ranked suggestions when the hash tier misses", async () => {
    mockReady([namesake("anthropics/skills", { rev: "hash-a" })]);
    computeSkillHash.mockResolvedValue("hash-other");

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
  });

  it("memoizes hash misses for the session but keeps suggesting", async () => {
    mockReady([namesake("anthropics/skills", { rev: "hash-a" })]);
    computeSkillHash.mockResolvedValue("hash-other");

    const first = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);
    expect(first.suggestions.pdf).toHaveLength(1);

    // Second pass: no re-hash, but the candidates are still offered.
    const second = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);
    expect(second.suggestions.pdf).toHaveLength(1);
    expect(computeSkillHash).toHaveBeenCalledTimes(1);
  });

  it("skips hashing for skills with no namesakes at all", async () => {
    mockReady([]);
    searchSkills.mockResolvedValue({ hits: [] });

    const { linked, suggestions } = await resolveAssociations([
      { name: "totally-custom", description: "whatever" },
    ]);

    expect(linked).toEqual([]);
    expect(suggestions).toEqual({});
    expect(computeSkillHash).not.toHaveBeenCalled();
  });

  it("treats a hashing failure as a miss, not an error", async () => {
    mockReady([namesake("anthropics/skills", { rev: "hash-a" })]);
    computeSkillHash.mockRejectedValue(new Error("disk gone"));

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(linked).toEqual([]);
    expect(recordSkillProvenanceBatch).not.toHaveBeenCalled();
    // Still confirmable by the user through the suggestion list.
    expect(suggestions.pdf).toHaveLength(1);
  });

  it("re-checks missed names once the registry epoch moves", async () => {
    mockReady([namesake("a/skills", { rev: "hash-a" })]);
    // The local copy hashes to something the current snapshot does not carry.
    computeSkillHash.mockResolvedValue("hash-other");
    await resolveAssociations([{ name: "pdf" }]);
    expect(computeSkillHash).toHaveBeenCalledTimes(1);

    // A new snapshot publishes the rev the local hash was waiting for; the
    // memoized miss must not survive the epoch change.
    getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 2 });
    noteRegistryEpoch(2);
    computeSkillHash.mockResolvedValue("hash-a");
    const { linked } = await resolveAssociations([{ name: "pdf" }]);
    expect(linked).toEqual(["pdf"]);
    expect(computeSkillHash).toHaveBeenCalledTimes(2);
  });

  it("runs no hash tier outside Tauri (the mock has no real files)", async () => {
    isTauri.mockReturnValue(false);
    mockReady([namesake("anthropics/skills", { rev: "hash-a" })]);

    const { linked, suggestions } = await resolveAssociations([
      { name: "pdf", description: "Read and convert PDF files." },
    ]);

    expect(computeSkillHash).not.toHaveBeenCalled();
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
    expect(computeSkillHash).not.toHaveBeenCalled();
    expect(searchSkills).not.toHaveBeenCalled();
  });
});
