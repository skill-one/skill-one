import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  installSkillFromSource,
  MOCK_INSTALL_DELAY_MS,
  SkillAlreadyInstalledError,
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
  // resetAllMocks (not clearAllMocks): a mockReturnValue(true) set in one
  // test must not leak into the next test's default undefined return.
  vi.resetAllMocks();
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

  it("fails when a same-named skill is already installed (skipped outcome)", async () => {
    // Since agents-skills 0.17 `add` never overwrites: a same-named skill comes
    // back as `skipped`. It is surfaced as an error so the existing skill's
    // provenance is never overwritten by the store row the user clicked.
    isTauri.mockReturnValue(true);
    installSkill.mockResolvedValue({ skill: "pdf", skipped: true });

    await expect(
      installSkillFromSource("anthropics/skills", "pdf", { rev: "rev-1" }),
    ).rejects.toBeInstanceOf(SkillAlreadyInstalledError);

    expect(recordSkillProvenance).not.toHaveBeenCalled();
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

  it("fails when the mock store already holds the same name", async () => {
    vi.useFakeTimers();
    isTauri.mockReturnValue(false);
    installMockSkill.mockReturnValue(true);

    const pending = installSkillFromSource("anthropics/skills", "pdf");
    // Attach the rejection handler before advancing timers, so the rejection
    // is not momentarily unhandled.
    const expectation = expect(pending).rejects.toBeInstanceOf(
      SkillAlreadyInstalledError,
    );
    await vi.advanceTimersByTimeAsync(MOCK_INSTALL_DELAY_MS);
    await expectation;

    expect(recordSkillProvenance).not.toHaveBeenCalled();
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
