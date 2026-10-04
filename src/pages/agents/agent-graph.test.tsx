import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderWithRouter } from "../../test/test-utils";
import type { AgentStatus } from "../../lib/skills-manager";
import { resetMockAgentStatus, setMockSkillEnabled } from "../../lib/mock-local";
import { fetchAgentStatus, fetchInstalledSkills } from "../../lib/local-skills";
import { AgentGraph, HOVER_MS } from "./agent-graph";

// The icon dataset is a runtime fetch; these are graph-behavior tests, so
// every node resolves to no candidates and draws its Bot fallback — except
// where a test overrides the mock to exercise a resolved icon.
//
// The default is re-armed in `beforeEach` and wiped in `afterEach` rather than
// restored at the end of the one test that overrides it: a reset that lives
// inside a test body is skipped the moment an assertion above it fails, and the
// leaked mock then cascades into every test that follows.
const { useAgentIconMock, NO_ICON } = vi.hoisted(() => {
  const noIcon = {
    candidates: [] as string[],
    mono: false,
    ground: undefined as "dark" | "light" | undefined,
  };
  return {
    NO_ICON: noIcon,
    useAgentIconMock: vi.fn((): {
      candidates: string[];
      mono: boolean;
      ground?: "dark" | "light";
    } => ({ ...noIcon })),
  };
});
vi.mock("../../hooks/use-agent-icons", () => ({
  useAgentIcon: useAgentIconMock,
}));

function agent(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    name: "cursor",
    display: "Cursor",
    linked: false,
    canonical: false,
    ...overrides,
  };
}

/**
 * The mock registry's installed set. Named here so a test can talk about "all
 * but one" without repeating the list, and so a change to `mock-local`'s
 * fixture is picked up rather than silently narrowing what a test covers.
 */
const INSTALLED = [
  "pdf",
  "docx",
  "pptx",
  "mcp-builder",
  "code-review",
  "frontend-design",
] as const;

/** Every installed skill except `pdf` — the set the jar tests park. */
const PARKED = INSTALLED.filter((name) => name !== "pdf");

const agents: AgentStatus[] = [
  agent({ name: "claude-code", display: "Claude Code", linked: true }),
  agent({
    name: "cursor",
    display: "Cursor",
    internalSkills: ["pdf", "docx"],
    internalOthers: ["README.md"],
  }),
  agent({ name: "gemini-cli", display: "Gemini CLI" }),
  agent({ name: "windsurf", display: "Windsurf", canonical: true }),
];

beforeEach(() => {
  useAgentIconMock.mockImplementation(() => ({ ...NO_ICON }));
});

afterEach(() => {
  useAgentIconMock.mockReset();
  resetMockAgentStatus();
  window.localStorage.clear();
});

/** Hover one agent's icon and wait for its card to settle. */
async function hoverAgent(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.hover(screen.getByRole("button", { name }));
}

/**
 * The jar's accessible name. It is a `figure` labelled by
 * `agents.hub.diskAria`, so tests reach it by role + name — no test id, and
 * the same pairing is what makes the label reach a screen reader.
 */
const HUB = /共享中心/;

describe("AgentGraph", () => {
  it("draws one quiet ribbon per agent, classified by its link state", () => {
    const { container } = renderWithRouter(<AgentGraph agents={agents} />);

    const ribbons = container.querySelectorAll("svg g[data-agent]");
    expect(ribbons).toHaveLength(4);
    expect(
      container
        .querySelector('g[data-agent="claude-code"]')
        ?.getAttribute("data-state"),
    ).toBe("linked");
    // Canonical agents read as linked to everything but the label.
    expect(
      container
        .querySelector('g[data-agent="windsurf"]')
        ?.getAttribute("data-state"),
    ).toBe("linked");
    // Content in an unlinked agent's own dir is the warning state.
    expect(
      container
        .querySelector('g[data-agent="cursor"]')
        ?.getAttribute("data-state"),
    ).toBe("warning");
    expect(
      container
        .querySelector('g[data-agent="gemini-cli"]')
        ?.getAttribute("data-state"),
    ).toBe("unlinked");

    // Nothing animates at rest: every ribbon is one static path, linked
    // ribbons included — the glow layer and idle flow are gone.
    for (const name of ["claude-code", "cursor", "gemini-cli", "windsurf"]) {
      const group = container.querySelector(`g[data-agent="${name}"]`)!;
      expect(group.getAttribute("data-lifted")).toBe("false");
      expect(group.querySelectorAll("path")).toHaveLength(1);
    }
  });

  it("opens the pulse with collect: the hovered shimmer runs into the hub", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<AgentGraph agents={agents} />);
    const root = container.querySelector("[data-pulse]")!;
    const group = (name: string) =>
      container.querySelector(`g[data-agent="${name}"]`)!;

    await hoverAgent(user, "Claude Code");

    // Collect: the hovered ribbon alone carries a shimmer, heading inward;
    // every other linked ribbon keeps its single quiet core line.
    expect(root.getAttribute("data-pulse")).toBe("collect");
    expect(group("claude-code").getAttribute("data-flow")).toBe("in");
    expect(group("claude-code").querySelectorAll("path")).toHaveLength(2);
    expect(group("windsurf").getAttribute("data-flow")).toBe("out");
    expect(group("windsurf").querySelectorAll("path")).toHaveLength(1);
  });

  it("stages the pulse: collect, then broadcast, looping, and idles on leave", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderWithRouter(<AgentGraph agents={agents} />);
      const root = container.querySelector("[data-pulse]")!;
      const paths = (name: string) =>
        container.querySelectorAll(`g[data-agent="${name}"] path`).length;
      const card = screen.getByRole("button", { name: "Claude Code" });

      // At rest nothing flows.
      expect(root.getAttribute("data-pulse")).toBe("idle");
      expect(paths("claude-code")).toBe(1);
      expect(paths("windsurf")).toBe(1);

      // Hovering one agent opens collect — its shimmer into the hub.
      fireEvent.mouseEnter(card);
      expect(root.getAttribute("data-pulse")).toBe("collect");
      expect(paths("claude-code")).toBe(2);
      expect(paths("windsurf")).toBe(1);

      // Once it lands, the hub broadcasts the skill back out to the rest.
      void act(() => vi.advanceTimersByTime(HOVER_MS + 50));
      expect(root.getAttribute("data-pulse")).toBe("broadcast");
      expect(paths("claude-code")).toBe(1);
      expect(paths("windsurf")).toBe(2);

      // ... then it collects again, looping while the pointer stays.
      void act(() => vi.advanceTimersByTime(HOVER_MS + 50));
      expect(root.getAttribute("data-pulse")).toBe("collect");
      expect(paths("claude-code")).toBe(2);
      expect(paths("windsurf")).toBe(1);

      // Leaving settles every ribbon back to full stillness.
      fireEvent.mouseLeave(card);
      expect(root.getAttribute("data-pulse")).toBe("idle");
      expect(paths("claude-code")).toBe(1);
      expect(paths("windsurf")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an unlinked ribbon fully quiet even while its icon is hovered", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<AgentGraph agents={agents} />);
    const gemini = container.querySelector('g[data-agent="gemini-cli"]')!;
    const path = gemini.querySelector("path")!;
    const before = path.getAttribute("stroke-width");

    await hoverAgent(user, "Gemini CLI");
    // A link that is not there answers nothing: no lift flag, no brightening,
    // no thickness change, no shimmer — one static path before and after.
    expect(gemini.getAttribute("data-lifted")).toBe("false");
    expect(gemini.querySelectorAll("path")).toHaveLength(1);
    expect(path.getAttribute("stroke-width")).toBe(before);

    await user.unhover(screen.getByRole("button", { name: "Gemini CLI" }));
    expect(gemini.getAttribute("data-lifted")).toBe("false");
  });

  it("renders every agent as a named pill — face, name, and nothing more", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    // The name sits beside its face in the pill; every pill is reachable by
    // name, and no state words or actions appear on the graph itself.
    for (const name of ["Claude Code", "Cursor", "Gemini CLI", "Windsurf"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    for (const label of ["已链接", "未链接", "原生目录", "链接", "取消链接"]) {
      expect(screen.queryByText(label)).toBeNull();
    }

    // Hovering wakes the ribbon pulse, never a tooltip.
    await hoverAgent(user, "Cursor");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("echoes the link state on the pill's edge, not in words", () => {
    renderWithRouter(<AgentGraph agents={agents} />);
    const icon = (label: string) => screen.getByRole("button", { name: label });

    // Unlinked: a dashed edge plus a styling hook.
    expect(icon("Gemini CLI")).toHaveAttribute("data-link-state", "unlinked");
    expect(icon("Gemini CLI").className).toContain("border-dashed");
    // Content a link would adopt: an amber edge.
    expect(icon("Cursor")).toHaveAttribute("data-link-state", "warning");
    expect(icon("Cursor").className).toContain("border-amber-500/50");
    // Linked: the plain edge, never dashed.
    expect(icon("Claude Code")).toHaveAttribute("data-link-state", "linked");
    expect(icon("Claude Code").className).not.toContain("border-dashed");
  });

  it("renders each agent as a macOS-style squircle tile", () => {
    // A resolved candidate, so the tile shows the brand glyph (not the Bot
    // fallback) — the shape asserts below are about the tile, not the glyph.
    useAgentIconMock.mockReturnValue({
      candidates: ["https://example.test/icons/cursor-color.svg"],
      mono: false,
      ground: undefined,
    });
    renderWithRouter(<AgentGraph agents={agents} />);
    const tile = screen
      .getByRole("button", { name: "Cursor" })
      .querySelector('[data-slot="agent-tile"]')!;

    // Rounded-square ground at the macOS ~22.5% corner proportion, not a
    // circle, with the brand glyph inset inside it.
    expect(tile).toBeInTheDocument();
    expect(tile.className).toContain("rounded-[22.5%]");
    expect(tile.className).not.toContain("rounded-full");
    expect(tile.querySelector("img")).toBeInTheDocument();
  });

  it("dims an unlinked agent's face so it reads as switched off", () => {
    renderWithRouter(<AgentGraph agents={agents} />);
    const face = (label: string) =>
      screen
        .getByRole("button", { name: label })
        .querySelector('[data-slot="agent-tile"]')!;

    // Unlinked: a greyed face; a linked one keeps its colour.
    expect(face("Gemini CLI").className).toContain("grayscale");
    expect(face("Claude Code").className).not.toContain("grayscale");
  });

  it("links an unlinked agent by clicking its icon", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    // The icon itself is the toggle.
    await user.click(screen.getByRole("button", { name: "Gemini CLI" }));

    // The click writes through to the backend (the browser mock here).
    const status = await fetchAgentStatus();
    expect(status.find((a) => a.name === "gemini-cli")?.linked).toBe(true);
  });

  it("unlinks a linked agent by clicking its icon", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    await user.click(screen.getByRole("button", { name: "Claude Code" }));

    const status = await fetchAgentStatus();
    expect(status.find((a) => a.name === "claude-code")?.linked).toBe(false);
  });

  it("leaves the canonical agent's pill inert, its name always visible", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<AgentGraph agents={agents} />);

    // A canonical agent uses its native skills directory, so its pill cannot
    // be switched off: disabled and reading as pressed, name on its face.
    const card = screen.getByRole("button", { name: "Windsurf" });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Windsurf")).toBeInTheDocument();

    // Hovering the inert pill still lifts its ribbon (the wrapper owns the
    // pointer events the disabled button swallows).
    await user.hover(card);
    expect(
      container.querySelector('g[data-agent="windsurf"]'),
    ).toHaveAttribute("data-lifted", "true");

    const status = await fetchAgentStatus();
    expect(status.find((a) => a.name === "windsurf")?.linked).toBe(false);
  });

  it("shows the central hub dashboard with active skills and quick links", async () => {
    renderWithRouter(<AgentGraph agents={agents} />);
    const skills = await fetchInstalledSkills();

    const disk = await screen.findByRole("figure", { name: HUB });
    expect(disk).toHaveTextContent(`${skills.length}/${skills.length}`);
    expect(disk).toHaveTextContent("1 个待处理");
    expect(disk).toHaveTextContent("安装一次，全 agents 直接使用");

    // Quick links are directly visible and accessible
    const storeLink = within(disk).getByRole("link", { name: /商店/ });
    expect(storeLink).toHaveAttribute("href", "/explore");

    const manageLink = within(disk).getByRole("link", { name: /管理/ });
    expect(manageLink).toHaveAttribute("href", "/installed");

    // Enabled skills are listed
    for (const { name } of skills) {
      const card = disk.querySelector<HTMLElement>(`[data-skill="${name}"]`);
      expect(card).not.toBeNull();
    }
  });

  it("renders pure icon and name without switches or extra info buttons", () => {
    renderWithRouter(<AgentGraph agents={agents} />);

    // Only main interactive pill buttons exist for each agent
    expect(screen.queryByRole("button", { name: "Cursor details" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("counts the enabled skills and displays active ones", async () => {
    for (const name of PARKED) setMockSkillEnabled(name, false);
    renderWithRouter(<AgentGraph agents={agents} />);

    const disk = await waitFor(() => {
      const el = screen.getByRole("figure", { name: HUB });
      expect(el.querySelector('[data-skill="pdf"]')).not.toBeNull();
      return el;
    });

    for (const name of PARKED) {
      expect(disk.querySelector(`[data-skill="${name}"]`)).toBeNull();
    }
    expect(disk).toHaveTextContent(`1/${INSTALLED.length}`);
  });

  it("empties the list and says so when no skill is enabled", async () => {
    for (const name of INSTALLED) setMockSkillEnabled(name, false);
    renderWithRouter(<AgentGraph agents={agents} />);

    const disk = await waitFor(() => {
      const el = screen.getByRole("figure", { name: HUB });
      expect(el).toHaveTextContent("还没有启用的技能");
      return el;
    });
    expect(disk).toHaveTextContent(`0/${INSTALLED.length}`);
    expect(disk.querySelector("[data-skill]")).toBeNull();
  });
});
