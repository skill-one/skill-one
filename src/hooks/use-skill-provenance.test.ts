import { describe, it, expect, vi, beforeEach } from "vitest";

const { isTauri, getPage, getRegistrySnapshot, computeSkillHash } = vi.hoisted(
  () => ({
    isTauri: vi.fn(),
    getPage: vi.fn(),
    getRegistrySnapshot: vi.fn(),
    computeSkillHash: vi.fn(),
  }),
);

vi.mock("../lib/tauri", () => ({ isTauri }));
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
import type { InstalledSkill } from "../lib/skills-manager";

const runQueryFn = fetchProvenanceState;

function installed(name: string, description?: string): InstalledSkill {
  return { name, path: `~/.agents/skills/${name}`, enabled: true, description };
}

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

beforeEach(() => {
  vi.clearAllMocks();
  resetLedgerFile();
  resetMockProvenance();
  resetLinkSuggestions();
  isTauri.mockReturnValue(true);
  getRegistrySnapshot.mockReturnValue({ ready: true, epoch: 1 });
});

describe("fetchProvenanceState", () => {
  it("auto-links a tool-installed skill whose hash matches a namesake", async () => {
    mockRegistry();
    computeSkillHash.mockResolvedValue("hash-a");

    const state = await runQueryFn([installed("pdf", "Read PDF files.")]);

    expect(state.linked.pdf?.repo).toBe("anthropics/skills");
    // Ledger entries written by the auto-link survive a reload.
    const rerun = await runQueryFn([installed("pdf", "Read PDF files.")]);
    expect(rerun.linked.pdf?.repo).toBe("anthropics/skills");
    // The second run skips the hash work entirely (ledger has it now).
    expect(computeSkillHash).toHaveBeenCalledTimes(1);
  });

  it("offers ranked suggestions when the hash tier misses", async () => {
    mockRegistry();
    computeSkillHash.mockResolvedValue("hash-other");

    const state = await runQueryFn([installed("pdf", "Read PDF files.")]);

    expect(state.linked.pdf).toBeUndefined();
    expect(state.suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
  });

  it("runs no hash tier outside Tauri (the mock has no real files)", async () => {
    isTauri.mockReturnValue(false);
    mockRegistry();

    const state = await runQueryFn([installed("pdf", "Read PDF files.")]);

    expect(computeSkillHash).not.toHaveBeenCalled();
    // Suggestions still work — they are registry lookups only.
    expect(state.suggestions.pdf).toHaveLength(1);
  });

  it("returns empty state when the registry is not ready", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: false, epoch: 0 });

    const state = await runQueryFn([installed("pdf", "Read PDF files.")]);
    expect(state.linked).toEqual({});
    expect(state.suggestions).toEqual({});
    expect(computeSkillHash).not.toHaveBeenCalled();
    expect(getPage).not.toHaveBeenCalled();
  });
});
