import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { toast } from "../../components/ui/toast";
import { renderWithRouter } from "../../test/test-utils";
import { getExcludedAgents } from "../../lib/agent-link-preferences";
import { resetMockAgentStatus } from "../../lib/mock-local";
import { AgentsPage } from "./agents-page";

function renderPage() {
  return renderWithRouter(<AgentsPage />, { route: "/" });
}

afterEach(() => {
  resetMockAgentStatus();
  // Link exclusions live in localStorage; one test's opt-out must not leak.
  window.localStorage.clear();
});

describe("AgentsPage", () => {
  it("draws every detected agent in the graph and states the summary", async () => {
    renderPage();

    // Three of the five mock agents are effectively linked (two linked plus
    // the canonical one); the summary in the head states it.
    expect(
      await screen.findByText("已连接 3/5 个 agent"),
    ).toBeInTheDocument();

    // Every agent is a node card, each with its link state.
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getByText("Gemini CLI")).toBeInTheDocument();
    expect(screen.getByText("Windsurf")).toBeInTheDocument();
  });

  it("flags, in the head, the agent whose own directory already holds content", async () => {
    renderPage();
    expect(await screen.findByText("已连接 3/5 个 agent")).toBeInTheDocument();
    // The head carries the attention count; the agent's own card holds only its
    // name — its warning state rides on the amber, still ribbon.
    expect(screen.getByText(/1 个待处理/)).toBeInTheDocument();
  });

  it("links an agent straight from its card and re-renders the graph", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    expect(await screen.findByText("已连接 3/5 个 agent")).toBeInTheDocument();

    // The card is the toggle: one click links the agent.
    await user.click(screen.getByRole("button", { name: "Gemini CLI" }));

    // The head summary flips to 4/5 and the ribbon joins the linked set.
    expect(
      await screen.findByText("已连接 4/5 个 agent"),
    ).toBeInTheDocument();
    const group = container.querySelector('g[data-agent="gemini-cli"]')!;
    expect(group.getAttribute("data-state")).toBe("linked");
  });

  it("unlinks a linked agent from its card and remembers it", async () => {
    const user = userEvent.setup();
    const successSpy = vi.spyOn(toast, "add");
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Claude Code" }),
    );

    expect(successSpy).toHaveBeenCalledWith({
      title: "Claude Code 已取消链接",
      type: "success",
    });
    expect(getExcludedAgents()).toEqual(["claude-code"]);
  });

  it("re-links an unlinked agent from its card", async () => {
    const user = userEvent.setup();
    const successSpy = vi.spyOn(toast, "add");
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Gemini CLI" }),
    );

    expect(successSpy).toHaveBeenCalledWith({
      title: "Gemini CLI 已链接",
      type: "success",
    });
    expect(getExcludedAgents()).toEqual([]);
  });

  it("leaves a canonical agent's card inert", async () => {
    renderPage();

    // A canonical agent uses its native skills directory, so its card cannot be
    // switched off — the button is disabled and reads as pressed.
    const card = await screen.findByRole("button", { name: "Windsurf" });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-pressed", "true");
  });
});
