import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  autoLinkByHash,
  MAX_CANDIDATES,
  rankCandidates,
  resetLinkSuggestions,
} from "./link-suggestions";
import type { Skill } from "../types/skill";

const { getPage, getRegistrySnapshot, computeSkillHash, recordSkillProvenance } =
  vi.hoisted(() => ({
    getPage: vi.fn(),
    getRegistrySnapshot: vi.fn(),
    computeSkillHash: vi.fn(),
    recordSkillProvenance: vi.fn(),
  }));

vi.mock("./registry/client", () => ({ getPage, getRegistrySnapshot }));
vi.mock("./skills-manager", () => ({ computeSkillHash }));
vi.mock("./provenance", () => ({ recordSkillProvenance }));

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
  getPage.mockResolvedValue({
    hits: entries.map((skill) => ({ skill, matched: {} })),
    total: entries.length,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLinkSuggestions();
});

describe("rankCandidates", () => {
  it("keeps only exact-slug namesakes, ranked by similarity", async () => {
    mockReady([
      namesake("a/skills", { description: "Read and manipulate PDF files." }),
      namesake("b/skills", { description: " totally unrelated " }),
      // Same normalized name but a different slug: filtered out.
      namesake("c/skills", { name: "pdf-pro" }),
    ]);

    const ranked = await rankCandidates("pdf", "Read and manipulate PDF files.");
    expect(ranked.map((c) => c.skill.repo)).toEqual(["a/skills"]);
    expect(ranked[0].similarity).toBe(1);
  });

  it("drops candidates below the similarity floor", async () => {
    mockReady([namesake("a/skills", { description: "cook italian pasta" })]);

    const ranked = await rankCandidates("pdf", "Read and manipulate PDF files.");
    expect(ranked).toEqual([]);
  });

  it("caps the candidate list", async () => {
    mockReady(
      Array.from({ length: 10 }, (_, i) =>
        namesake(`repo-${i}/skills`, {
          description: `Read and manipulate PDF files v${i}`,
        }),
      ),
    );

    const ranked = await rankCandidates("pdf", "Read and manipulate PDF files.");
    expect(ranked).toHaveLength(MAX_CANDIDATES);
  });

  it("returns nothing when the registry is not ready", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: false, epoch: 0 });

    expect(await rankCandidates("pdf", "read pdf files")).toEqual([]);
    expect(getPage).not.toHaveBeenCalled();
  });
});

describe("autoLinkByHash", () => {
  it("writes the ledger entry for a hash-identical namesake", async () => {
    mockReady([
      namesake("anthropics/skills", { rev: "hash-a" }),
      namesake("fork/skills", { rev: "hash-fork" }),
    ]);
    computeSkillHash.mockResolvedValue("hash-fork");

    const linked = await autoLinkByHash([{ name: "pdf" }]);

    expect(linked).toEqual(["pdf"]);
    expect(recordSkillProvenance).toHaveBeenCalledWith("fork/skills", "pdf");
  });

  it("memoizes misses for the session", async () => {
    mockReady([namesake("a/skills", { rev: "hash-a" })]);
    computeSkillHash.mockResolvedValue("hash-other");

    expect(await autoLinkByHash([{ name: "pdf" }])).toEqual([]);
    expect(await autoLinkByHash([{ name: "pdf" }])).toEqual([]);
    expect(computeSkillHash).toHaveBeenCalledTimes(1);
  });

  it("treats a hashing failure as a miss, not an error", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 1 });
    computeSkillHash.mockRejectedValue(new Error("disk gone"));

    await expect(autoLinkByHash([{ name: "pdf" }])).resolves.toEqual([]);
    expect(recordSkillProvenance).not.toHaveBeenCalled();
  });

  it("re-checks a missed name once the registry epoch moves", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 1 });
    getPage.mockResolvedValue({
      hits: [{ skill: namesake("a/skills", { rev: "hash-a" }), matched: {} }],
      total: 1,
    });
    // The local copy hashes to something the current snapshot does not carry.
    computeSkillHash.mockResolvedValue("hash-other");
    await autoLinkByHash([{ name: "pdf" }]);
    expect(computeSkillHash).toHaveBeenCalledTimes(1);

    // A new snapshot publishes the rev the local hash was waiting for; the
    // memoized miss must not survive the epoch change.
    getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 2 });
    const { noteRegistryEpoch } = await import("./link-suggestions");
    noteRegistryEpoch(2);
    computeSkillHash.mockResolvedValue("hash-a");
    expect(await autoLinkByHash([{ name: "pdf" }])).toEqual(["pdf"]);
    expect(computeSkillHash).toHaveBeenCalledTimes(2);
  });
});
