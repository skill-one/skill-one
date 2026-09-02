import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../test/test-utils";
import { fetchInstalledSkills } from "../lib/local-skills";
import type { InstalledSkill } from "../lib/skills-manager";
import {
  POPOVER_NAVIGATE_EVENT,
  SKILLS_CHANGED_EVENT,
  skillPath,
} from "./popover-events";
import { PopoverPage } from "./popover-page";

type EventHandler = (event: { payload: unknown }) => void;

const { emitMock, hideMock, listenMock, focusChangedMock, eventHandlers, focusHandlers } =
  vi.hoisted(() => {
    const eventHandlers = new Map<string, EventHandler>();
    const focusHandlers = new Set<EventHandler>();
    const unlisten = () => {};
    return {
      emitMock: vi.fn(),
      hideMock: vi.fn(),
      eventHandlers,
      focusHandlers,
      listenMock: vi.fn((event: string, handler: EventHandler) => {
        eventHandlers.set(event, handler);
        return Promise.resolve(unlisten);
      }),
      focusChangedMock: vi.fn((handler: EventHandler) => {
        focusHandlers.add(handler);
        return Promise.resolve(unlisten);
      }),
    };
  });

vi.mock("../lib/local-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/local-skills")>();
  return {
    ...actual,
    fetchInstalledSkills: vi.fn(),
  };
});

// The popover's Tauri-only behaviors (navigate emit, Escape hide, live-sync
// listeners) are asserted with the Tauri environment on.
vi.mock("../lib/tauri", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ emit: emitMock, listen: listenMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ hide: hideMock, onFocusChanged: focusChangedMock }),
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
  eventHandlers.clear();
  focusHandlers.clear();
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

    expect(await screen.findByText("Skill One")).toBeInTheDocument();
    // Count matches the visible (enabled-only) list, not the raw total.
    expect(await screen.findByText("2 个技能")).toBeInTheDocument();
  });

  it("renders the name and description per entry", async () => {
    renderWithRouter(<PopoverPage />);

    expect(await screen.findByText("PDF 工具")).toBeInTheDocument();
    expect(screen.getByText("Word 工具")).toBeInTheDocument();
  });

  it("clips the content to the native material's corner radius", async () => {
    renderWithRouter(<PopoverPage />);
    const root = (await screen.findByText("Skill One")).closest(".h-screen");

    // The glass backdrop is rounded natively (`POPOVER_MATERIAL_RADIUS` in
    // tray.rs); row highlights must never bleed past those corners.
    expect(root?.className).toContain("overflow-hidden");
    expect(root?.className).toContain("rounded-[var(--popover-radius)]");
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

  it("registers a skills-changed listener on the Tauri bus", async () => {
    renderWithRouter(<PopoverPage />);
    await screen.findByText("pdf");

    expect(eventHandlers.has(SKILLS_CHANGED_EVENT)).toBe(true);
  });

  it("refreshes live when another window reports the skills list changed", async () => {
    renderWithRouter(<PopoverPage />);
    await screen.findByText("pdf");

    // The main window just enabled a new skill: it broadcasts the change.
    fetchInstalledSkillsMock.mockResolvedValue([
      skill({ name: "freshly-enabled", description: "刚开启" }),
    ]);
    await act(async () => {
      eventHandlers.get(SKILLS_CHANGED_EVENT)?.({ payload: undefined });
    });

    expect(await screen.findByText("freshly-enabled")).toBeInTheDocument();
    expect(screen.queryByText("pdf")).not.toBeInTheDocument();
  });

  it("refreshes when the popover window gains focus", async () => {
    renderWithRouter(<PopoverPage />);
    await screen.findByText("pdf");

    // Re-opening the popover (menu bar click) focuses its window.
    fetchInstalledSkillsMock.mockResolvedValue([skill({ name: "on-open" })]);
    const onFocus = [...focusHandlers][0];
    expect(onFocus).toBeTypeOf("function");
    await act(async () => {
      onFocus({ payload: true });
    });

    expect(await screen.findByText("on-open")).toBeInTheDocument();
  });

  it("ignores focus-lost events (does not refetch on blur)", async () => {
    renderWithRouter(<PopoverPage />);
    await screen.findByText("pdf");
    fetchInstalledSkillsMock.mockClear();

    const onFocus = [...focusHandlers][0];
    await act(async () => {
      onFocus({ payload: false });
    });

    expect(fetchInstalledSkillsMock).not.toHaveBeenCalled();
  });
});
