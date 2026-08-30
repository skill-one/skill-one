import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../test/test-utils";
import { fetchInstalledSkills } from "../lib/local-skills";
import type { InstalledSkill } from "../lib/skills-manager";
import { PopoverPage } from "./popover-page";

const { emitMock, hideMock, setSizeMock } = vi.hoisted(() => ({
  emitMock: vi.fn(),
  hideMock: vi.fn(),
  setSizeMock: vi.fn(),
}));

vi.mock("../lib/local-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/local-skills")>();
  return {
    ...actual,
    fetchInstalledSkills: vi.fn(),
  };
});

// The popover's Tauri-only behaviors (store emit, Escape hide, content-driven
// resize) are asserted with the Tauri environment on.
vi.mock("../lib/tauri", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ emit: emitMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ hide: hideMock, setSize: setSizeMock }),
}));

const fetchInstalledSkillsMock = vi.mocked(fetchInstalledSkills);

function skill(overrides: Partial<InstalledSkill>): InstalledSkill {
  return {
    name: "pdf",
    path: "/skills/pdf",
    scope: "global",
    agents: [],
    source: null,
    sourceUrl: null,
    sourceType: null,
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchInstalledSkillsMock.mockResolvedValue([skill({})]);
});

describe("PopoverPage", () => {
  it("resizes the window to the clamped content height after loading", async () => {
    // jsdom reports zero element sizes, so the natural height falls through
    // to the MIN clamp — asserting the whole clamp + resize pipeline.
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("1 个技能")).toBeInTheDocument();
    await vi.waitFor(() => expect(setSizeMock).toHaveBeenCalled());
    const size = setSizeMock.mock.calls[0][0];
    expect(size.width).toBe(320);
    expect(size.height).toBe(200);
  });

  it("lists installed skills with enabled/disabled badges and a header count", async () => {
    fetchInstalledSkillsMock.mockResolvedValue([
      skill({ name: "pdf", description: "Read and process PDF files", enabled: true }),
      skill({ name: "old-skill", enabled: false }),
    ]);
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("2 个技能")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("Read and process PDF files")).toBeInTheDocument();
    expect(screen.getByText("old-skill")).toBeInTheDocument();
    expect(screen.getAllByText("启用")).toHaveLength(1);
    expect(screen.getByText("停用")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is installed", async () => {
    fetchInstalledSkillsMock.mockResolvedValue([]);
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("还没有安装任何 skill")).toBeInTheDocument();
    expect(screen.getByText("去商店逛逛，挑一个装上吧")).toBeInTheDocument();
    expect(screen.getByText("0 个技能")).toBeInTheDocument();
  });

  it("emits the navigate event with the store path on 打开商店", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PopoverPage />);

    await user.click(await screen.findByRole("button", { name: /打开商店/ }));

    expect(emitMock).toHaveBeenCalledWith("popover-navigate", {
      path: "/explore",
    });
  });

  it("hides the popover window on Escape", async () => {
    renderWithRouter(<PopoverPage />);

    expect(
      await screen.findByRole("button", { name: /打开商店/ }),
    ).toBeInTheDocument();
    expect(hideMock).not.toHaveBeenCalled();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(hideMock).toHaveBeenCalledTimes(1);
  });
});
