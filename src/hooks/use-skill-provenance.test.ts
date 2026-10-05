import { describe, it, expect, vi, beforeEach } from "vitest";

const { isTauri, namesakeSkills, getRegistrySnapshot, skillFingerprint } = vi.hoisted(
  () => ({
    isTauri: vi.fn(),
    namesakeSkills: vi.fn(),
    getRegistrySnapshot: vi.fn(),
    skillFingerprint: vi.fn(),
  }),
);

vi.mock("../lib/tauri", () => ({ isTauri }));
vi.mock("../lib/registry/client", () => ({ namesakeSkills, getRegistrySnapshot }));
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
  skillFingerprint,
  readProvenanceRaw,
  writeProvenanceRaw,
  // The activity log's append path: linking a skill records an event, and the
  // write itself is not what this suite is about.
  appendActivityRaw: vi.fn(),
}));

import { resetMockProvenance } from "../lib/provenance";
import { resetLinkSuggestions } from "../lib/link-suggestions";
import { fetchProvenanceState } from "./use-skill-provenance";
import type { InstalledSkill } from "../lib/skills-manager";

const runQueryFn = fetchProvenanceState;

function installed(name: string, description = ""): InstalledSkill {
  return {
    name,
    enabled: true,
    description,
  };
}

const NAMESAKE = {
  skill: {
    name: "pdf",
    repo: "anthropics/skills",
    description: "Read PDF files.",
    stars: 1,
    downloads: 1,
    path: "skills/a/b/pdf",
  },
  matched: {},
};

function mockRegistry() {
  getRegistrySnapshot.mockReturnValue({
    ready: true,
    epoch: 1,
    index: { etag: '"e1"' },
  });
  namesakeSkills.mockResolvedValue({ entries: [[NAMESAKE.skill]] });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLedgerFile();
  resetMockProvenance();
  resetLinkSuggestions();
  isTauri.mockReturnValue(true);
  skillFingerprint.mockResolvedValue(null);
  getRegistrySnapshot.mockReturnValue({
    ready: true,
    epoch: 1,
    index: { etag: '"e1"' },
  });
});

describe("fetchProvenanceState", () => {
  it("surfaces candidates as suggestions for a tool-installed skill whose description matches a namesake", async () => {
    mockRegistry();

    const state = await runQueryFn([installed("pdf", "Read PDF files.")]);

    expect(state.linked.pdf).toBeUndefined();
    expect(state.suggestions.pdf?.[0]?.skill.repo).toBe("anthropics/skills");
  });

  it("offers ranked suggestions when the description does not match", async () => {
    mockRegistry();

    // A description below the 90% auto-link threshold keeps the skill in the
    // confirmable pool.
    const state = await runQueryFn([installed("pdf", "Convert PDF files.")]);

    expect(state.linked.pdf).toBeUndefined();
    expect(state.suggestions.pdf[0].skill.repo).toBe("anthropics/skills");
  });

  it("stats no directory outside Tauri (the mock has no real files)", async () => {
    isTauri.mockReturnValue(false);
    mockRegistry();

    // Below the 90% auto-link threshold, so it stays a suggestion even with no
    // fingerprint to store.
    const state = await runQueryFn([installed("pdf", "Convert PDF files.")]);

    expect(skillFingerprint).not.toHaveBeenCalled();
    // Suggestions still work — they are registry lookups only.
    expect(state.suggestions.pdf).toHaveLength(1);
  });

  it("returns empty state when the registry is not ready", async () => {
    getRegistrySnapshot.mockReturnValue({ ready: false, epoch: 0, index: null });

    const state = await runQueryFn([installed("pdf", "Read PDF files.")]);
    expect(state.linked).toEqual({});
    expect(state.suggestions).toEqual({});
    expect(skillFingerprint).not.toHaveBeenCalled();
    expect(namesakeSkills).not.toHaveBeenCalled();
  });
});
