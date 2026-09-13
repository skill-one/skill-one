import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  isTauri,
  fetchInstalledSkills,
  getPage,
  getRegistrySnapshot,
  computeSkillHash,
} = vi.hoisted(() => ({
  isTauri: vi.fn(),
  fetchInstalledSkills: vi.fn(),
  getPage: vi.fn(),
  getRegistrySnapshot: vi.fn(),
  computeSkillHash: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({ isTauri }));
vi.mock("../lib/local-skills", () => ({ fetchInstalledSkills }));
vi.mock("../lib/registry/client", () => ({ getPage, getRegistrySnapshot }));
// A stateful stand-in for the on-disk ledger file, so the real provenance
// persistence round-trips inside the test.
const { readProvenanceRaw, writeProvenanceRaw, resetLedgerFile } = vi.hoisted(
  () => {
    let file: string | null = null;
    return {
      readProvenanceRaw: vi.fn(async () => file),
      writeProvenanceRaw: vi.fn(async (content: string) => {
        file = content;
      }),
      resetLedgerFile: vi.fn(() => {
        file = null;
      }),
    };
  },
);
vi.mock("../lib/skills-manager", () => ({
  computeSkillHash,
  readProvenanceRaw,
  writeProvenanceRaw,
}));

import { resetMockProvenance } from "../lib/provenance";
import { resetLinkSuggestions } from "../lib/link-suggestions";
import { fetchProvenanceState } from "./use-skill-provenance";

const NAMESAKE = {
  skill: {
    name: "pdf",
    repo: "anthropics/skills",
    description: "Read PDF files.",
    stars: 1,
    downloads: 1,
    path: "skills/a/b/pdf",
    rev: "hash-a",
  },
  matched: {},
};

function mockRegistry() {
  getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 1 });
  getPage.mockResolvedValue({ hits: [NAMESAKE], total: 1 });
}

const runQueryFn = fetchProvenanceState;

beforeEach(() => {
  vi.clearAllMocks();
  resetLedgerFile();
  resetMockProvenance();
  resetLinkSuggestions();
  isTauri.mockReturnValue(true);
  getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 1 });
});

describe("useSkillProvenance queryFn", () => {
  it("auto-links a tool-installed skill whose hash matches a namesake", async () => {
    fetchInstalledSkills.mockResolvedValue([
      { name: "pdf", description: "Read PDF files.", enabled: true },
    ]);
    mockRegistry();
    computeSkillHash.mockResolvedValue("hash-a");

    const state = (await runQueryFn()) as {
      linked: Record<string, { repo: string }>;
    };

    expect(state.linked.pdf?.repo).toBe("anthropics/skills");
    // Ledger entries written by the auto-link survive a reload.
    const rerun = (await runQueryFn()) as {
      linked: Record<string, { repo: string }>;
    };
    expect(rerun.linked.pdf?.repo).toBe("anthropics/skills");
    // The second run skips the hash work entirely (ledger has it now).
    expect(computeSkillHash).toHaveBeenCalledTimes(1);
  });

  it("offers ranked suggestions when the hash tier misses", async () => {
    fetchInstalledSkills.mockResolvedValue([
      { name: "pdf", description: "Read PDF files.", enabled: true },
    ]);
    mockRegistry();
    computeSkillHash.mockResolvedValue("hash-other");

    const state = (await runQueryFn()) as {
      linked: Record<string, { repo: string } | undefined>;
      suggestions: Record<string, Array<{ skill: { repo: string } }>>;
    };

    expect(state.linked.pdf).toBeUndefined();
    expect(state.suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
  });

  it("runs no hash tier outside Tauri (the mock has no real files)", async () => {
    isTauri.mockReturnValue(false);
    fetchInstalledSkills.mockResolvedValue([
      { name: "pdf", description: "Read PDF files.", enabled: true },
    ]);
    mockRegistry();

    await runQueryFn();

    expect(computeSkillHash).not.toHaveBeenCalled();
    // Suggestions still work — they are registry lookups only.
    const state = (await runQueryFn()) as {
      suggestions: Record<string, unknown[]>;
    };
    expect(state.suggestions.pdf).toHaveLength(1);
  });

  it("returns empty state when the registry is not ready", async () => {
    fetchInstalledSkills.mockResolvedValue([
      { name: "pdf", description: "Read PDF files.", enabled: true },
    ]);
    getRegistrySnapshot.mockReturnValue({ ready: false, epoch: 0 });

    const state = (await runQueryFn()) as {
      linked: Record<string, { repo: string }>;
      suggestions: Record<string, unknown[]>;
    };
    expect(state.linked).toEqual({});
    expect(state.suggestions).toEqual({});
    expect(computeSkillHash).not.toHaveBeenCalled();
  });
});
