import { describe, expect, it, afterEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, screen } from "@testing-library/react";

import { renderWithRouter } from "../../test/test-utils";
import type { AgentStatus } from "../../lib/skills-manager";
import { resetMockAgentStatus } from "../../lib/mock-local";
import { fetchAgentStatus } from "../../lib/local-skills";
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

describe("AgentGraph", () => {
  it("draws one ribbon per agent, classified by its link state", () => {
    const { container } = renderWithRouter(<AgentGraph agents={agents} />);

    const ribbons = container.querySelectorAll("svg g[data-agent]");
    expect(ribbons).toHaveLength(4);
    expect(
      container.querySelector('g[data-agent="claude-code"]')?.getAttribute(
        "data-state",
      ),
    ).toBe("linked");
    // Canonical agents read as linked to everything but the label.
    expect(
      container.querySelector('g[data-agent="windsurf"]')?.getAttribute(
        "data-state",
      ),
    ).toBe("linked");
    // Content in an unlinked agent's own dir is the warning state.
    expect(
      container.querySelector('g[data-agent="cursor"]')?.getAttribute(
        "data-state",
      ),
    ).toBe("warning");
    expect(
      container.querySelector('g[data-agent="gemini-cli"]')?.getAttribute(
        "data-state",
      ),
    ).toBe("unlinked");
  });

  it("only animates linked ribbons — unlinked ones are static lines", () => {
    const { container } = renderWithRouter(<AgentGraph agents={agents} />);

    // Linked ribbons carry the moving shimmer (motion paths); the two
    // unlinked states render one static plain <path> each, tagged so the
    // distinction is testable.
    expect(
      container
        .querySelector('g[data-agent="claude-code"]')
        ?.getAttribute("data-animated"),
    ).toBe("true");
    const cursorGroup = container.querySelector('g[data-agent="cursor"]')!;
    const geminiGroup = container.querySelector(
      'g[data-agent="gemini-cli"]',
    )!;
    expect(cursorGroup.getAttribute("data-animated")).toBe("false");
    expect(geminiGroup.getAttribute("data-animated")).toBe("false");
    expect(cursorGroup.querySelectorAll("path")).toHaveLength(1);
    expect(geminiGroup.querySelectorAll("path")).toHaveLength(1);
  });

  it("flows out of the hub by default and reverses only the hovered ribbon", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<AgentGraph agents={agents} />);
    const flow = (name: string) =>
      container
        .querySelector(`g[data-agent="${name}"]`)
        ?.getAttribute("data-flow");

    // Every live ribbon carries skills from the hub out to its agent.
    expect(flow("claude-code")).toBe("out");
    expect(flow("windsurf")).toBe("out");

    // The pointer on one agent reverses just that ribbon — it installs into the
    // hub while everyone else keeps receiving.
    await user.hover(screen.getByRole("button", { name: "Claude Code" }));
    expect(flow("claude-code")).toBe("in");
    expect(flow("windsurf")).toBe("out");
  });

  it("stages the hover pulse: collect, then broadcast, then idle on leave", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderWithRouter(<AgentGraph agents={agents} />);
      const root = container.querySelector("[data-pulse]")!;
      const card = screen.getByRole("button", { name: "Claude Code" });

      expect(root).toHaveAttribute("data-pulse", "idle");

      // Hovering one agent opens the collect phase — its shimmer into the hub.
      fireEvent.mouseEnter(card);
      expect(root).toHaveAttribute("data-pulse", "collect");

      // Once it lands, the hub broadcasts the skill back out to the rest.
      act(() => vi.advanceTimersByTime(HOVER_MS + 50));
      expect(root).toHaveAttribute("data-pulse", "broadcast");

      // ... then it collects again, looping while the pointer stays.
      act(() => vi.advanceTimersByTime(HOVER_MS + 50));
      expect(root).toHaveAttribute("data-pulse", "collect");

      // Leaving settles every ribbon back to the plain outward flow.
      fireEvent.mouseLeave(card);
      expect(root).toHaveAttribute("data-pulse", "idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels every other ribbon's shimmer while one agent collects", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderWithRouter(<AgentGraph agents={agents} />);
      const paths = (name: string) =>
        container.querySelectorAll(`g[data-agent="${name}"] path`).length;
      const card = screen.getByRole("button", { name: "Claude Code" });

      // Idle: glow + core + one shimmer on every live ribbon.
      expect(paths("claude-code")).toBe(3);
      expect(paths("windsurf")).toBe(3);

      // Hover one: only its shimmer survives; the rest drop to glow + core,
      // their shimmer cancelled outright rather than left gliding on.
      fireEvent.mouseEnter(card);
      expect(paths("claude-code")).toBe(3);
      expect(paths("windsurf")).toBe(2);

      // Broadcast: the hovered one goes quiet and the rest take over.
      act(() => vi.advanceTimersByTime(HOVER_MS + 50));
      expect(paths("claude-code")).toBe(2);
      expect(paths("windsurf")).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the brand-mark black hub the ribbons converge on", () => {
    const { getByTestId } = renderWithRouter(<AgentGraph agents={agents} />);
    const hub = getByTestId("agent-hub");
    expect(hub).toBeInTheDocument();
    // The convergence core is the logo's near-black circle (not the blue app
    // icon), carrying the white favicon glyph.
    const core = hub.querySelector("circle");
    expect(core?.getAttribute("fill")).toBe("#18181b");
    // The favicon glyph: the two overlapping rounded squares.
    expect(hub.querySelectorAll("g rect")).toHaveLength(2);
  });

  it("lists every agent as a bare name card — the ribbon carries the state", () => {
    const { getByText, queryByText } = renderWithRouter(
      <AgentGraph agents={agents} />,
    );

    expect(getByText("Claude Code")).toBeInTheDocument();
    expect(getByText("Cursor")).toBeInTheDocument();
    // The card says only the agent's name: the link state is not spelled out
    // (nor are the pending adoption/quarantine counts) — the ribbon's colour and
    // motion own that distinction.
    for (const label of [
      "已链接",
      "未链接",
      "原生",
      "2 个 skill",
      "1 项文件",
    ]) {
      expect(queryByText(label)).toBeNull();
    }
  });

  it("echoes the link state on the card's edge, not in words", () => {
    renderWithRouter(<AgentGraph agents={agents} />);
    const card = (label: string) =>
      screen.getByRole("button", { name: label });

    // Unlinked: a dashed edge plus a styling hook.
    expect(card("Gemini CLI")).toHaveAttribute("data-link-state", "unlinked");
    expect(card("Gemini CLI").className).toContain("border-dashed");
    // Content a link would adopt: an amber edge.
    expect(card("Cursor")).toHaveAttribute("data-link-state", "warning");
    expect(card("Cursor").className).toContain("border-amber-500/40");
    // Linked: the plain edge, never dashed.
    expect(card("Claude Code")).toHaveAttribute("data-link-state", "linked");
    expect(card("Claude Code").className).not.toContain("border-dashed");
  });

  it("dims an unlinked agent's card so it reads as switched off", () => {
    renderWithRouter(<AgentGraph agents={agents} />);
    const face = (label: string) =>
      screen
        .getByRole("button", { name: label })
        .querySelector('[data-slot="avatar"]')!;

    // Unlinked: a greyed face and a dimmed name.
    expect(face("Gemini CLI").className).toContain("grayscale");
    expect(screen.getByText("Gemini CLI").className).toContain(
      "text-muted-foreground",
    );
    // Linked: the face keeps its colour and the name stays plain.
    expect(face("Claude Code").className).not.toContain("grayscale");
    expect(screen.getByText("Claude Code").className).not.toContain(
      "text-muted-foreground",
    );
  });

  it("links an unlinked agent by clicking its card", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    // The card itself is the toggle; the agent name is its accessible name.
    await user.click(screen.getByRole("button", { name: "Gemini CLI" }));

    // The toggle writes through to the backend (the browser mock here): the
    // agent is linked at the source, which is what the page's query would
    // re-render from. The graph itself is props-driven.
    const status = await fetchAgentStatus();
    expect(status.find((a) => a.name === "gemini-cli")?.linked).toBe(true);
  });

  it("leaves the canonical agent's card inert", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    // A canonical agent uses its native skills directory, so its card cannot be
    // switched off: the button is disabled and reads as pressed.
    const card = screen.getByRole("button", { name: "Windsurf" });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-pressed", "true");

    // Clicking it writes nothing through.
    await user.click(card);
    const status = await fetchAgentStatus();
    expect(status.find((a) => a.name === "windsurf")?.linked).toBe(false);
  });
});
