import { describe, expect, it, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/react";

import { renderWithRouter } from "../../test/test-utils";
import type { AgentStatus } from "../../lib/skills-manager";
import { resetMockAgentStatus } from "../../lib/mock-local";
import { fetchAgentStatus } from "../../lib/local-skills";
import { AgentGraph } from "./agent-graph";

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

  it("lists every agent as a node card with its state and pending counts", () => {
    const { getByText } = renderWithRouter(<AgentGraph agents={agents} />);

    expect(getByText("Claude Code")).toBeInTheDocument();
    expect(getByText("Cursor")).toBeInTheDocument();
    // Warning agents still read "未链接" — the amber dot and border carry the
    // distinction — and their pending adoption/quarantine counts ride the card.
    expect(getByText("2 个 skill")).toBeInTheDocument();
    expect(getByText("1 项文件")).toBeInTheDocument();
    // The canonical agent keeps its own word.
    expect(getByText("原生")).toBeInTheDocument();
  });

  it("links an unlinked agent from its node popover", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    // The card is the popover trigger; the agent name is its accessible name.
    await user.click(screen.getByRole("button", { name: "Gemini CLI" }));

    const popover = await screen.findByRole("dialog");
    expect(
      within(popover).getByText("连接到 Skill One"),
    ).toBeInTheDocument();
    const switchEl = within(popover).getByRole("switch", {
      name: "Gemini CLI 链接开关",
    });
    expect(switchEl).toHaveAttribute("aria-checked", "false");

    await user.click(switchEl);

    // The toggle writes through to the backend (the browser mock here): the
    // agent is linked at the source, which is what the page's query would
    // re-render from. The graph itself is props-driven.
    const status = await fetchAgentStatus();
    expect(status.find((a) => a.name === "gemini-cli")?.linked).toBe(true);
  });

  it("pins the canonical agent's switch in its node popover", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentGraph agents={agents} />);

    await user.click(screen.getByRole("button", { name: "Windsurf" }));
    const popover = await screen.findByRole("dialog");
    const switchEl = within(popover).getByRole("switch", {
      name: "Windsurf 链接开关",
    });
    expect(switchEl).toHaveAttribute("aria-disabled", "true");
    expect(switchEl).toHaveAttribute("aria-checked", "true");
    expect(
      within(popover).getByText(/原生 skills 目录/),
    ).toBeInTheDocument();
  });
});
