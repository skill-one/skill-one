import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  installSkillFromSource,
  MOCK_INSTALL_DELAY_MS,
} from "./local-skills";

const { isTauri, installSkill, installMockSkill, recordSkillProvenance } =
  vi.hoisted(() => ({
    isTauri: vi.fn(),
    installSkill: vi.fn(),
    installMockSkill: vi.fn(),
    recordSkillProvenance: vi.fn(),
  }));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({ installSkill }));
vi.mock("./mock-local", () => ({ installMockSkill }));
vi.mock("./provenance", () => ({ recordSkillProvenance }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("installSkillFromSource", () => {
  it("hands the owner/repo@<skill> source to the backend's install (Tauri)", async () => {
    isTauri.mockReturnValue(true);
    installSkill.mockResolvedValue({ skill: "pdf", skipped: false });

    await installSkillFromSource("anthropics/skills", "pdf", {
      rev: "rev-at-install",
    });

    // Since agents-skills 0.21 the source carries the skill: one source is one
    // skill, matched on the directory basename — which is what the store's
    // slug already is.
    expect(installSkill).toHaveBeenCalledWith("anthropics/skills@pdf");
    // The install source lands in the provenance ledger (Tauri path) with
    // the store-side content hash as the installed version marker.
    expect(recordSkillProvenance).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "rev-at-install",
    );
  });

  it("records the install without a hash when the entry carries no rev", async () => {
    isTauri.mockReturnValue(true);
    installSkill.mockResolvedValue({ skill: "pdf", skipped: false });

    await installSkillFromSource("anthropics/skills", "pdf");

    expect(recordSkillProvenance).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      undefined,
    );
  });

  it("propagates the backend's install failure", async () => {
    // One source is one skill, so a failure is this call's rejection — there
    // is no per-skill outcome list to inspect, and nothing to translate: the
    // library's message is what the reader sees.
    isTauri.mockReturnValue(true);
    installSkill.mockRejectedValue(
      new Error("download failed: network unreachable"),
    );

    await expect(
      installSkillFromSource("anthropics/skills", "pdf"),
    ).rejects.toThrow("download failed: network unreachable");
  });

  it("propagates the backend's refusal of an unresolvable source", async () => {
    isTauri.mockReturnValue(true);
    installSkill.mockRejectedValue(
      new Error("no directory named missing in anthropics/skills"),
    );

    await expect(
      installSkillFromSource("anthropics/skills", "missing"),
    ).rejects.toThrow("no directory named missing");
  });

  it("treats an already-installed skill as a no-op, not a failure", async () => {
    // Since agents-skills 0.17 `add` never overwrites: a same-named skill comes
    // back as `skipped`, which must not read as a failure.
    isTauri.mockReturnValue(true);
    installSkill.mockResolvedValue({ skill: "pdf", skipped: true });

    await installSkillFromSource("anthropics/skills", "pdf", { rev: "rev-1" });

    // The skill is on disk, so its install source is still worth recording.
    expect(recordSkillProvenance).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "rev-1",
    );
  });

  it("records the install in the mock store outside Tauri", async () => {
    vi.useFakeTimers();
    isTauri.mockReturnValue(false);

    const pending = installSkillFromSource("anthropics/skills", "pdf");
    await vi.advanceTimersByTimeAsync(MOCK_INSTALL_DELAY_MS);
    await pending;

    expect(installMockSkill).toHaveBeenCalledWith("pdf");
    expect(installSkill).not.toHaveBeenCalled();
    // The browser mock records the source in the ledger too, mirroring the
    // Tauri flow.
    expect(recordSkillProvenance).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      undefined,
    );
  });

  it("does not record provenance when the install fails", async () => {
    isTauri.mockReturnValue(true);
    installSkill.mockRejectedValue(
      new Error("download failed: network unreachable"),
    );

    await expect(
      installSkillFromSource("anthropics/skills", "pdf"),
    ).rejects.toThrow("download failed: network unreachable");

    expect(recordSkillProvenance).not.toHaveBeenCalled();
  });

  it("delays the mock install so the installing state stays observable", async () => {
    vi.useFakeTimers();
    isTauri.mockReturnValue(false);

    const pending = installSkillFromSource("anthropics/skills", "pdf");
    await vi.advanceTimersByTimeAsync(MOCK_INSTALL_DELAY_MS - 1);
    expect(installMockSkill).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(installMockSkill).toHaveBeenCalledTimes(1);
  });
});
