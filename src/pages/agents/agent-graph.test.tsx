import { describe, expect, it, afterEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, screen } from "@testing-library/react";

import { renderWithRouter } from "../../test/test-utils";
import type { AgentStatus } from "../../lib/skills-manager";
import { resetMockAgentStatus } from "../../lib/mock-local";
import { fetchAgentStatus, fetchInstalledSkills } from "../../lib/local-skills";
import { AgentGraph, HOVER_MS } from "./agent-graph";

function agent(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    name: "cursor",
    display: "Cursor",
    linked: false,
    canonical: false,
    ...overrides,
  };
}

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

afterEach(() => {
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
      act(() => vi.advanceTimersByTime(HOVER_MS + 50));
      expect(root.getAttribute("data-pulse")).toBe("broadcast");
      expect(paths("claude-code")).toBe(1);
      expect(paths("windsurf")).toBe(2);

      // ... then it collects again, looping while the pointer stays.
      act(() => vi.advanceTimersByTime(HOVER_MS + 50));
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

  it("renders every agent as a bare icon — hover names it, and nothing more", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    // No name text on the graph itself; every icon is reachable by name.
    expect(screen.queryByText("Claude Code")).toBeNull();
    for (const name of ["Claude Code", "Cursor", "Gemini CLI", "Windsurf"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }

    // The tooltip carries the name alone — no state words, no actions; the
    // icon's edge and face already say the state, and the icon is the switch.
    await hoverAgent(user, "Cursor");
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Cursor");
    for (const label of ["已链接", "未链接", "原生目录", "链接", "取消链接"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("echoes the link state on the icon's edge, not in words", () => {
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

  it("leaves the canonical agent's icon inert, but still names it on hover", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    // A canonical agent uses its native skills directory, so its icon cannot
    // be switched off: disabled and reading as pressed.
    const card = screen.getByRole("button", { name: "Windsurf" });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-pressed", "true");

    // Even though the button is disabled, its wrapper still opens the name
    // tooltip (the disabled element itself swallows pointer events).
    await user.hover(card);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Windsurf");

    const status = await fetchAgentStatus();
    expect(status.find((a) => a.name === "windsurf")?.linked).toBe(false);
  });

  it("shows only the installed count on the disk itself", async () => {
    renderWithRouter(<AgentGraph agents={agents} />);
    const skills = await fetchInstalledSkills();

    // The disk is the count alone — the routes live in its hover card.
    const disk = await screen.findByTestId("agent-hub");
    expect(disk).toHaveTextContent(String(skills.length));
    expect(disk.querySelectorAll("a")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "商店" })).toBeNull();
    expect(screen.queryByRole("link", { name: "管理" })).toBeNull();
  });

  it("lists the enabled skills in the disk's hover card with the two routes", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    await user.hover(await screen.findByTestId("agent-hub"));
    expect(await screen.findByText("已启用的技能")).toBeInTheDocument();
    expect(screen.getByText("6/6")).toBeInTheDocument();
    for (const name of [
      "pdf",
      "docx",
      "pptx",
      "mcp-builder",
      "code-review",
      "frontend-design",
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }

    // The card's footer carries exactly one route to each destination.
    expect(screen.getByRole("link", { name: "商店" })).toHaveAttribute(
      "href",
      "/explore",
    );
    expect(screen.getByRole("link", { name: "管理" })).toHaveAttribute(
      "href",
      "/my-skills",
    );
  });
});
