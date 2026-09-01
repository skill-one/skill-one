import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../test/test-utils";
import { fetchInstalledSkills } from "../lib/local-skills";
import type { InstalledSkill } from "../lib/skills-manager";
import { POPOVER_NAVIGATE_EVENT, skillPath } from "./popover-events";
import { PopoverPage } from "./popover-page";

const { emitMock, hideMock } = vi.hoisted(() => ({
  emitMock: vi.fn(),
  hideMock: vi.fn(),
}));

vi.mock("../lib/local-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/local-skills")>();
  return {
    ...actual,
    fetchInstalledSkills: vi.fn(),
  };
});

// The popover's Tauri-only behaviors (navigate emit, Escape hide) are
// asserted with the Tauri environment on.
vi.mock("../lib/tauri", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ emit: emitMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ hide: hideMock }),
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
    description: "PDF 工具",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchInstalledSkillsMock.mockResolvedValue([
    skill({}),
    skill({ name: "docx", description: "Word 工具" }),
    skill({ name: "parked", description: "已停用", enabled: false }),
  ]);
});

describe("PopoverPage", () => {
  it("lists only installed and enabled skills", async () => {
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    // Disabled skills are parked in the backend's disabled dir and belong
    // to the main window's management page, not the glanceable popover.
    expect(screen.queryByText("parked")).not.toBeInTheDocument();
  });

  it("shows the header title and enabled count", async () => {
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("SkillOne")).toBeInTheDocument();
    // Count matches the visible (enabled-only) list, not the raw total.
    expect(await screen.findByText("2 个技能")).toBeInTheDocument();
  });

  it("renders the name and description per entry", async () => {
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("PDF 工具")).toBeInTheDocument();
    expect(screen.getByText("Word 工具")).toBeInTheDocument();
  });

  it("shows an empty state when no skill is enabled", async () => {
    fetchInstalledSkillsMock.mockResolvedValue([
      skill({ name: "parked", enabled: false }),
    ]);
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("没有已启用的技能")).toBeInTheDocument();
  });

  it("shows an error state when the list fails to load", async () => {
    fetchInstalledSkillsMock.mockRejectedValue(new Error("backend down"));
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("技能列表加载失败")).toBeInTheDocument();
    expect(screen.getByText("backend down")).toBeInTheDocument();
  });

  it("emits a deep link to the clicked skill", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PopoverPage />);

    await user.click(await screen.findByRole("button", { name: /pdf/ }));

    expect(emitMock).toHaveBeenCalledWith(POPOVER_NAVIGATE_EVENT, {
      path: skillPath("pdf"),
    });
  });

  it("emits the my-skills path from the footer button", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PopoverPage />);

    await user.click(
      await screen.findByRole("button", { name: "打开 Skill One" }),
    );

    expect(emitMock).toHaveBeenCalledWith(POPOVER_NAVIGATE_EVENT, {
      path: "/my-skills",
    });
  });

  it("hides the window on Escape", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PopoverPage />);

    await user.keyboard("{Escape}");

    expect(hideMock).toHaveBeenCalled();
  });
});
